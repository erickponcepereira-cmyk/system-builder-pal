-- Adiciona flag "grants_subscription_perks" para gate de carteirinha + tickets
ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS grants_subscription_perks boolean NOT NULL DEFAULT false;
ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS grants_subscription_perks boolean NOT NULL DEFAULT false;

-- Sindscond: produto mensalidade concede 1 ticket + 30 dias
UPDATE public.professional_products pp
   SET grants_subscription_perks = true
 WHERE pp.name = 'Benefícios SINDSCOND';

-- Reescreve grant_partner_product_perks:
-- * Apenas produtos com grants_subscription_perks = true concedem carteirinha (30 dias) e 1 ticket
-- * Pontos de carreira do coach (career points) continuam funcionando para todos
CREATE OR REPLACE FUNCTION public.grant_partner_product_perks(_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o record;
  v_card_days int := 0;
  v_tickets int := 0;
  v_points int;
  v_paid_at timestamptz;
  v_i int;
  v_product_id uuid;
  v_grants_perks boolean := false;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id;
  IF o.id IS NULL OR o.status <> 'paid' THEN RETURN; END IF;

  v_paid_at := COALESCE(o.paid_at, now());
  v_product_id := COALESCE(o.partner_product_id, o.professional_product_id);

  -- Consulta a flag específica do produto vendido
  IF o.professional_product_id IS NOT NULL THEN
    SELECT COALESCE(grants_subscription_perks, false)
      INTO v_grants_perks
      FROM public.professional_products
     WHERE id = o.professional_product_id;
  ELSIF o.partner_product_id IS NOT NULL THEN
    SELECT COALESCE(grants_subscription_perks, false)
      INTO v_grants_perks
      FROM public.partner_products
     WHERE id = o.partner_product_id;
  END IF;

  IF COALESCE(v_grants_perks, false) THEN
    v_card_days := 30;
    v_tickets := 1;
  END IF;

  -- Carteirinha
  IF v_card_days > 0 AND o.student_id IS NOT NULL
     AND COALESCE((o.metadata->>'perks_granted')::boolean, false) IS NOT TRUE THEN
    UPDATE public.students s
       SET card_valid_until = GREATEST(COALESCE(s.card_valid_until, CURRENT_DATE), CURRENT_DATE) + (v_card_days || ' days')::interval
     WHERE s.id = o.student_id;
  END IF;

  -- Tickets
  IF v_tickets > 0 AND o.student_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.student_challenge_tokens t
                      WHERE t.student_id = o.student_id
                        AND t.notes = 'partner_order:' || o.id::text) THEN
    FOR v_i IN 1..v_tickets LOOP
      INSERT INTO public.student_challenge_tokens (student_id, source_product_id, granted_by, granted_at, notes, created_at)
      VALUES (o.student_id, v_product_id, 'partner_product_purchase', v_paid_at, 'partner_order:' || o.id::text, v_paid_at);
    END LOOP;
  END IF;

  -- Pontos de carreira do coach vendedor (mantido para TODOS os produtos)
  v_points := public.compute_system_fee_points(COALESCE(o.system_fee, 0));
  IF v_points > 0 AND o.selling_coach_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.coach_points_log cpl
                      WHERE cpl.coach_id = o.selling_coach_id
                        AND cpl.metadata->>'partner_order_id' = o.id::text) THEN
    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata, created_at)
    VALUES (o.selling_coach_id, NULL, v_product_id, v_points,
            'Taxa de sistema (parceiro/profissional)',
            jsonb_build_object('partner_order_id', o.id, 'system_fee', o.system_fee),
            v_paid_at);
  END IF;

  UPDATE public.partner_product_orders
     SET metadata = COALESCE(metadata,'{}'::jsonb)
                    || jsonb_build_object(
                         'perks_granted', true,
                         'perks_card_days', v_card_days,
                         'perks_tickets', v_tickets,
                         'perks_career_points', v_points
                       )
   WHERE id = _order_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.grant_partner_product_perks(uuid) TO authenticated, service_role;