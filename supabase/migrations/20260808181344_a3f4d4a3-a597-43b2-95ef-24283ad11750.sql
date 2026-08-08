CREATE OR REPLACE FUNCTION public.grant_partner_product_perks(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  o record;
  v_card_days int := 0;
  v_tickets int := 0;
  v_points int;
  v_paid_at timestamptz;
  v_i int;
  v_product_id uuid;
  v_catalog_product_id uuid;
  v_grants_perks boolean := false;
  v_price numeric := 0;
  v_days_override int;
  v_tickets_override int;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id;
  IF o.id IS NULL OR o.status <> 'paid' THEN RETURN; END IF;

  v_paid_at := COALESCE(o.paid_at, now());
  v_product_id := COALESCE(o.partner_product_id, o.professional_product_id);

  IF o.professional_product_id IS NOT NULL THEN
    SELECT COALESCE(grants_subscription_perks, false), COALESCE(price, 0),
           perk_card_days_override, perk_challenge_tickets_override
      INTO v_grants_perks, v_price, v_days_override, v_tickets_override
      FROM public.professional_products
     WHERE id = o.professional_product_id;
  ELSIF o.partner_product_id IS NOT NULL THEN
    SELECT COALESCE(grants_subscription_perks, false), COALESCE(price, 0),
           perk_card_days_override, perk_challenge_tickets_override
      INTO v_grants_perks, v_price, v_days_override, v_tickets_override
      FROM public.partner_products
     WHERE id = o.partner_product_id;
  END IF;

  IF COALESCE(v_grants_perks, false) THEN
    v_card_days := 30;
    v_tickets := 1;
  ELSE
    SELECT b.card_days, b.challenge_tickets
      INTO v_card_days, v_tickets
      FROM public.compute_partner_product_benefits(GREATEST(COALESCE(o.gross_amount, 0), v_price)) b;
  END IF;

  IF v_days_override IS NOT NULL THEN v_card_days := v_days_override; END IF;
  IF v_tickets_override IS NOT NULL THEN v_tickets := v_tickets_override; END IF;

  v_card_days := COALESCE(v_card_days, 0);
  v_tickets := COALESCE(v_tickets, 0);

  IF v_card_days > 0 AND o.student_id IS NOT NULL
     AND COALESCE((o.metadata->>'perks_card_days')::int, 0) = 0 THEN
    UPDATE public.students s
       SET card_valid_until = GREATEST(COALESCE(s.card_valid_until, CURRENT_DATE), CURRENT_DATE) + (v_card_days || ' days')::interval
     WHERE s.id = o.student_id;
  END IF;

  -- source_product_id referencia public.products; produtos de parceiro/profissional
  -- vivem em outras tabelas, entao so preenche quando existir no catalogo principal.
  SELECT p.id INTO v_catalog_product_id FROM public.products p WHERE p.id = v_product_id;

  IF v_tickets > 0 AND o.student_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.student_challenge_tokens t
                      WHERE t.student_id = o.student_id
                        AND t.notes = 'partner_order:' || o.id::text) THEN
    FOR v_i IN 1..v_tickets LOOP
      INSERT INTO public.student_challenge_tokens (student_id, source_product_id, granted_by, granted_at, notes, created_at)
      VALUES (o.student_id, v_catalog_product_id, 'purchase', v_paid_at,
              'partner_order:' || o.id::text, v_paid_at);
    END LOOP;
  END IF;

  v_points := public.compute_system_fee_points(COALESCE(o.system_fee, 0));
  IF v_points > 0 AND o.selling_coach_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.coach_points_log cpl
                      WHERE cpl.coach_id = o.selling_coach_id
                        AND cpl.metadata->>'partner_order_id' = o.id::text) THEN
    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata, created_at)
    VALUES (o.selling_coach_id, NULL, NULL, v_points,
            'Taxa de sistema (parceiro/profissional)',
            jsonb_build_object(
              'partner_order_id', o.id,
              'system_fee', o.system_fee,
              'partner_product_id', o.partner_product_id,
              'professional_product_id', o.professional_product_id
            ),
            v_paid_at);
  END IF;

  UPDATE public.partner_product_orders
     SET metadata = (COALESCE(metadata,'{}'::jsonb) - 'perks_error' - 'perks_error_at')
                    || jsonb_build_object(
                         'perks_granted', true,
                         'perks_card_days', v_card_days,
                         'perks_tickets', v_tickets,
                         'perks_career_points', v_points
                       )
   WHERE id = _order_id;
END;
$fn$;

CREATE OR REPLACE FUNCTION public._wrap_grant_partner_product_perks_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_err text;
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.paid_at IS DISTINCT FROM NEW.paid_at) THEN
    BEGIN
      PERFORM public.grant_partner_product_perks(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      v_err := SQLERRM;
      RAISE WARNING 'grant_partner_product_perks falhou para pedido %: %', NEW.id, v_err;
      BEGIN
        UPDATE public.partner_product_orders
           SET metadata = COALESCE(metadata,'{}'::jsonb)
                          || jsonb_build_object('perks_error', v_err, 'perks_error_at', now())
         WHERE id = NEW.id;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Reprocessa pedidos pagos que ficaram sem beneficios
DO $do$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.partner_product_orders
     WHERE status = 'paid'
       AND COALESCE((metadata->>'perks_granted')::boolean, false) = false
  LOOP
    BEGIN
      PERFORM public.grant_partner_product_perks(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'backfill perks falhou para %: %', r.id, SQLERRM;
    END;
  END LOOP;
END;
$do$;