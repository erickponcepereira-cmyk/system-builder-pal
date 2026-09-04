
-- Lista de vendas de produto em carência por perfil, considerando co-produção.
CREATE OR REPLACE FUNCTION public.admin_blocked_creator_orders(_profile_id uuid, _admin_user_id uuid)
RETURNS TABLE(
  order_id uuid,
  order_number text,
  amount numeric,
  own_role text,
  paid_at timestamp with time zone,
  releases_at timestamp with time zone,
  shared boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    e.reference_id,
    o.order_number,
    round(SUM(e.amount), 2),
    CASE WHEN bool_or(e.source_type = 'product_created') THEN 'owner' ELSE 'coproducer' END,
    o.paid_at,
    MIN(e.available_at),
    EXISTS (SELECT 1 FROM public.product_coproduction_credits cc WHERE cc.order_id = o.id)
  FROM public.financial_ledger_events(_profile_id) e
  JOIN public.partner_product_orders o ON o.id = e.reference_id
  WHERE public.is_admin(_admin_user_id)
    AND e.source_type IN ('product_created', 'coproduction_paid', 'coproduction_received')
    AND e.state = 'hold'
  GROUP BY e.reference_id, o.order_number, o.paid_at, o.id
  HAVING round(SUM(e.amount), 2) <> 0
  ORDER BY o.paid_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_blocked_creator_orders(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_blocked_creator_orders(uuid, uuid) TO authenticated, service_role;

-- Liberação antecipada: aceita o co-produtor e recalcula todos os envolvidos.
CREATE OR REPLACE FUNCTION public.admin_advance_creator_release(
  _profile_id uuid,
  _order_ids uuid[],
  _admin_user_id uuid,
  _reason text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner_ids uuid[];
  v_coach_ids uuid[];
  v_allowed uuid[];
  v_total numeric := 0;
  v_owner uuid;
BEGIN
  IF NOT public.is_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF _profile_id IS NULL OR _order_ids IS NULL OR array_length(_order_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Informe o perfil e ao menos um pedido';
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_partner_ids FROM public.partners WHERE profile_id = _profile_id;
  SELECT COALESCE(array_agg(id), '{}') INTO v_coach_ids FROM public.coaches WHERE profile_id = _profile_id;

  -- Pedidos em que o perfil é dono OU co-produtor.
  SELECT COALESCE(array_agg(DISTINCT o.id), '{}') INTO v_allowed
  FROM public.partner_product_orders o
  LEFT JOIN public.product_coproduction_credits cc ON cc.order_id = o.id
  LEFT JOIN public.product_coproductions pc ON pc.id = cc.coproduction_id
  WHERE o.id = ANY(_order_ids)
    AND o.status = 'paid'
    AND COALESCE(o.released_early, false) = false
    AND (
      o.partner_id = ANY(v_partner_ids)
      OR o.professional_coach_id = ANY(v_coach_ids)
      OR (cc.collaborator_type = 'partner' AND cc.collaborator_id = ANY(v_partner_ids))
      OR (cc.collaborator_type <> 'partner' AND cc.collaborator_id = ANY(v_coach_ids))
      OR (pc.creator_type = 'partner' AND pc.creator_id = ANY(v_partner_ids))
      OR (pc.creator_type <> 'partner' AND pc.creator_id = ANY(v_coach_ids))
    );

  IF array_length(v_allowed, 1) IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.partner_product_orders o
  SET released_early = true,
      released_early_at = now(),
      released_early_by = _admin_user_id,
      released_early_reason = _reason
  WHERE o.id = ANY(v_allowed);

  -- Valor efetivamente liberado para este perfil (dono e/ou co-produtor).
  SELECT COALESCE(round(SUM(e.amount), 2), 0) INTO v_total
  FROM public.financial_ledger_events(_profile_id) e
  WHERE e.reference_id = ANY(v_allowed)
    AND e.source_type IN ('product_created', 'coproduction_paid', 'coproduction_received');

  -- Recalcula todos os perfis envolvidos nos pedidos liberados.
  FOR v_owner IN
    SELECT DISTINCT pr.profile_id FROM (
      SELECT p.profile_id FROM public.partner_product_orders o
        JOIN public.partners p ON p.id = o.partner_id WHERE o.id = ANY(v_allowed)
      UNION
      SELECT c.profile_id FROM public.partner_product_orders o
        JOIN public.coaches c ON c.id = o.professional_coach_id WHERE o.id = ANY(v_allowed)
      UNION
      SELECT p.profile_id FROM public.product_coproduction_credits cc
        JOIN public.partners p ON cc.collaborator_type = 'partner' AND p.id = cc.collaborator_id
        WHERE cc.order_id = ANY(v_allowed)
      UNION
      SELECT c.profile_id FROM public.product_coproduction_credits cc
        JOIN public.coaches c ON cc.collaborator_type <> 'partner' AND c.id = cc.collaborator_id
        WHERE cc.order_id = ANY(v_allowed)
      UNION
      SELECT _profile_id
    ) pr
    WHERE pr.profile_id IS NOT NULL
  LOOP
    PERFORM public.recalc_wallets_for_owner(v_owner);
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_advance_creator_release(uuid, uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_advance_creator_release(uuid, uuid[], uuid, text) TO authenticated, service_role;
