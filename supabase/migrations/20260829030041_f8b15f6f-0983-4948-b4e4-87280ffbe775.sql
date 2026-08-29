-- 1) grant_partner_product_perks: pontos vão para o coach TITULAR do aluno
CREATE OR REPLACE FUNCTION public.grant_partner_product_perks(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_points_coach_id uuid;
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
       SET card_valid_until = GREATEST(
             COALESCE(s.card_valid_until, v_paid_at),
             v_paid_at + (v_card_days || ' days')::interval)
     WHERE s.id = o.student_id;
  END IF;

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

  -- pontos: sempre para o coach TITULAR do aluno (nunca o master da venda cruzada)
  v_points_coach_id := COALESCE(
    NULLIF(o.metadata->'master_cross_sale'->>'titular_coach_id','')::uuid,
    o.selling_coach_id
  );

  v_points := public.compute_system_fee_points(COALESCE(o.system_fee, 0));
  IF v_points > 0 AND v_points_coach_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.coach_points_log cpl
                      WHERE cpl.metadata->>'partner_order_id' = o.id::text) THEN
    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata, created_at)
    VALUES (v_points_coach_id, NULL, NULL, v_points,
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
$function$;

-- 2) process_paid_transaction: pontos = taxa de sistema da venda / 2
DO $do$
DECLARE
  d text;
  old_calc text := '  computed_points := COALESCE(product.points_per_sale, 0);
  IF computed_points <= 0 THEN computed_points := 1; END IF;';
  new_calc text := '  SELECT public.compute_system_fee_points(COALESCE(SUM(amount), 0))
    INTO computed_points
    FROM public.admin_system_wallet_entries
   WHERE transaction_id = _transaction_id AND kind = ''credit'';
  computed_points := COALESCE(computed_points, 0);';
  old_ins text := '    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata)
    VALUES (coach_row.id, _transaction_id, tx.product_id, computed_points, ''sale'',
            jsonb_build_object(''product_name'', product.name, ''gross_amount'', tx.gross_amount));';
  new_ins text := '    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata)
    SELECT coach_row.id, _transaction_id, tx.product_id, computed_points, ''sale'',
           jsonb_build_object(''product_name'', product.name, ''gross_amount'', tx.gross_amount)
    WHERE computed_points > 0;';
BEGIN
  d := pg_get_functiondef('public.process_paid_transaction(uuid)'::regprocedure);

  IF position(old_calc in d) = 0 THEN
    RAISE EXCEPTION 'bloco de cálculo de pontos não encontrado em process_paid_transaction';
  END IF;
  IF position(old_ins in d) = 0 THEN
    RAISE EXCEPTION 'insert de coach_points_log não encontrado em process_paid_transaction';
  END IF;

  d := replace(d, old_calc, new_calc);
  d := replace(d, old_ins, new_ins);

  EXECUTE d;
END
$do$;