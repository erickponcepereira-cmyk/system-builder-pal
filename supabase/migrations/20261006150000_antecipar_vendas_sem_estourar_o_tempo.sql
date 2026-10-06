-- Antecipar a liberação de vendas de produto estourava o tempo do banco.
--
-- Em 06/10/2026 o admin tentou liberar as 64 vendas da 33doctor (Dr. Augustus,
-- R$ 775,91) e recebeu "canceling statement due to statement timeout". O UPDATE
-- marcava os 64 pedidos de uma vez, e cada linha disparava dois gatilhos de
-- recálculo de carteira (`partner_product_orders_recalc_trg` e
-- `trg_recalc_buyer_wallet_partner_orders`) — 64 recálculos da mesma carteira,
-- e a função ainda recalculava de novo no fim. Nada foi liberado: o comando foi
-- cancelado inteiro.
--
-- Agora o UPDATE roda com `fitmind.recalculo_adiado` ligado (o mesmo mecanismo
-- da unificação de cadastros), e cada carteira envolvida é recalculada uma vez
-- só, no laço que a função já tinha no fim. Liberar uma venda não mexe no que o
-- comprador gastou, então o recálculo do comprador não faz falta.
--
-- As cinco funções desta tela recebem o id do admin como parâmetro e confiam
-- nele. Todas são chamadas só pelo servidor, com a chave de serviço; com EXECUTE
-- aberto a `authenticated`, qualquer pessoa logada podia chamá-las passando o id
-- de um admin e antecipar a própria comissão. Ficam só para `service_role`.

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

  -- Os gatilhos de recálculo esperam: a carteira é recalculada uma vez, no laço abaixo.
  PERFORM set_config('fitmind.recalculo_adiado', 'on', true);
  UPDATE public.partner_product_orders o
  SET released_early = true,
      released_early_at = now(),
      released_early_by = _admin_user_id,
      released_early_reason = _reason
  WHERE o.id = ANY(v_allowed);
  PERFORM set_config('fitmind.recalculo_adiado', 'off', true);

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

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'admin_advance_creator_release',
        'admin_blocked_creator_orders',
        'admin_advance_commission_release_batch',
        'admin_blocked_commissions',
        'admin_recalc_wallets_for_profile'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
