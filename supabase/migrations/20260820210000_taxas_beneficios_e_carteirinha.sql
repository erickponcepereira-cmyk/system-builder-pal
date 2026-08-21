-- ============================================================================
-- Regularizacao: mudancas aplicadas direto no banco em 20/08/2026 pelo editor
-- SQL, sem passar por migration. Este arquivo apenas registra no repositorio o
-- que JA esta rodando em producao, para que o repo e o banco voltem a
-- concordar. Reaplicar e inofensivo: e CREATE OR REPLACE do estado atual.
--
--  1. compute_partner_product_benefits  -> regua nova de carteirinha/tickets
--  2. recalculate_student_card_access   -> carteirinha nao cumulativa, 3 fontes
--  3. grant_partner_product_perks       -> concessao na venda nao soma
--  4. grant_collab_monthly_benefits     -> concessao da mensalidade nao soma
-- ============================================================================

CREATE OR REPLACE FUNCTION public.compute_partner_product_benefits(_price numeric)
 RETURNS TABLE(card_days integer, challenge_tickets integer)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pgmq', 'pg_temp'
AS $function$
  SELECT
    CASE
      WHEN _price >= 1000 THEN 90
      WHEN _price >= 500  THEN 60
      WHEN _price >= 100  THEN 30
      ELSE 15
    END,
    CASE
      WHEN _price >= 1000 THEN 3
      WHEN _price >= 500  THEN 2
      WHEN _price >= 100  THEN 1
      ELSE 0
    END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_student_card_access(_student_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn_aluno3$
DECLARE
  v_until timestamptz := NULL;
BEGIN
  IF _student_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT max(x.expira) INTO v_until
  FROM (
    -- Fonte 1: loja FitMind
    SELECT COALESCE(t.paid_at, t.created_at)
             + make_interval(days => GREATEST(0, COALESCE(p.card_access_days, 0))::int) AS expira
      FROM public.transactions t
      JOIN public.products p ON p.id = t.product_id
     WHERE t.student_id = _student_id
       AND t.status = 'paid'
       AND COALESCE(p.card_access_days, 0) > 0
       AND COALESCE(t.paid_at, t.created_at) IS NOT NULL

    UNION ALL

    -- Fonte 2: parceiro e profissional
    SELECT COALESCE(o.paid_at, o.created_at)
             + make_interval(days => GREATEST(0, COALESCE(
                 NULLIF(o.metadata->>'perks_card_days', '')::int,
                 b.card_days,
                 0))::int) AS expira
      FROM public.partner_product_orders o
      LEFT JOIN public.partner_products      pp ON pp.id = o.partner_product_id
      LEFT JOIN public.professional_products fp ON fp.id = o.professional_product_id
      CROSS JOIN LATERAL public.compute_partner_product_benefits(
             GREATEST(COALESCE(o.gross_amount, 0), COALESCE(pp.price, fp.price, 0))) b
     WHERE o.student_id = _student_id
       AND o.status = 'paid'
       AND COALESCE(o.paid_at, o.created_at) IS NOT NULL
       AND GREATEST(0, COALESCE(
             NULLIF(o.metadata->>'perks_card_days', '')::int, b.card_days, 0)) > 0

    UNION ALL

    -- Fonte 3: mensalidade do colaborador (parceiro/profissional) que dá
    -- 30 dias aos alunos dele. O rastro é o ticket gerado na mesma concessão.
    SELECT COALESCE(si.paid_at, k.granted_at) + INTERVAL '30 days' AS expira
      FROM public.student_challenge_tokens k
      JOIN public.subscription_invoices si ON si.id = k.source_subscription_invoice_id
     WHERE k.student_id = _student_id
       AND k.source_subscription_invoice_id IS NOT NULL
       AND COALESCE(si.paid_at, k.granted_at) IS NOT NULL
  ) x;

  UPDATE public.students
     SET card_valid_until = v_until
   WHERE id = _student_id;

  RETURN v_until;
END;
$fn_aluno3$;

CREATE OR REPLACE FUNCTION public.grant_partner_product_perks(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn_perks$
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

  -- >>> ÚNICA MUDANÇA: conta a partir da data do pagamento, não soma no saldo.
  IF v_card_days > 0 AND o.student_id IS NOT NULL
     AND COALESCE((o.metadata->>'perks_card_days')::int, 0) = 0 THEN
    UPDATE public.students s
       SET card_valid_until = GREATEST(
             COALESCE(s.card_valid_until, v_paid_at),
             v_paid_at + (v_card_days || ' days')::interval)
     WHERE s.id = o.student_id;
  END IF;
  -- <<< fim da mudança

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
$fn_perks$;

CREATE OR REPLACE FUNCTION public.grant_collab_monthly_benefits(_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn_collab$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_partner_id uuid;
  v_prof_coach_id uuid;
  v_ref_month date;
  v_paid_at timestamptz;
  r RECORD;
  v_inserted boolean;
BEGIN
  -- >>> passou a ler tambem o paid_at da fatura
  SELECT user_id, reference_month, COALESCE(paid_at, now())
    INTO v_user_id, v_ref_month, v_paid_at
    FROM public.subscription_invoices
   WHERE id = _invoice_id;
  -- <<<
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_profile_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_partner_id    FROM public.partners WHERE profile_id = v_profile_id LIMIT 1;
  SELECT id INTO v_prof_coach_id FROM public.coaches
    WHERE profile_id = v_profile_id AND is_professional = true LIMIT 1;

  IF v_partner_id IS NULL AND v_prof_coach_id IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT DISTINCT s.id AS student_id
      FROM public.students s
     WHERE (v_partner_id    IS NOT NULL AND s.partner_id           = v_partner_id)
        OR (v_prof_coach_id IS NOT NULL AND s.professional_coach_id = v_prof_coach_id)
  LOOP
    v_inserted := false;
    BEGIN
      INSERT INTO public.student_challenge_tokens
        (student_id, source_subscription_invoice_id, granted_by, notes)
      VALUES
        (r.student_id, _invoice_id, 'purchase',
         'Colaborador — mensalidade ' || COALESCE(to_char(v_ref_month, 'YYYY-MM'), ''));
      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      v_inserted := false;
    END;

    IF v_inserted THEN
      -- >>> conta a partir do pagamento da fatura e nao soma no saldo
      UPDATE public.students
         SET card_valid_until = GREATEST(
               COALESCE(card_valid_until, v_paid_at),
               v_paid_at + INTERVAL '30 days'),
             updated_at = now()
       WHERE id = r.student_id;
      -- <<<
    END IF;
  END LOOP;
END;
$fn_collab$;
