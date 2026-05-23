-- ── 1. Colunas extras em career_plan_config ──────────────────
ALTER TABLE public.career_plan_config
  ADD COLUMN IF NOT EXISTS plan_type          TEXT NOT NULL DEFAULT 'period'
    CHECK (plan_type IN ('period', 'monthly_challenge')),
  ADD COLUMN IF NOT EXISTS required_period_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reward_image_url   TEXT,
  ADD COLUMN IF NOT EXISTS product_id         UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── 2. Colunas extras em career_plan_progress ────────────────
ALTER TABLE public.career_plan_progress
  ADD COLUMN IF NOT EXISTS accumulated_points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_start       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS period_end         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now();

-- ── 3. Limpar dados fictícios ─────────────────────────────────
DELETE FROM public.monthly_rankings
WHERE coach_id NOT IN (
  SELECT DISTINCT s.coach_id
  FROM public.transactions t
  JOIN public.students s ON s.id = t.student_id
  WHERE t.status = 'paid'
);

DELETE FROM public.coach_goals
WHERE coach_id NOT IN (SELECT id FROM public.coaches);

-- ── 4. Seed: 2 planos de carreira pré-configurados ───────────
INSERT INTO public.career_plan_config (
  name, description, plan_type, duration_months,
  min_monthly_points, required_period_points,
  reward_description, reward_details, is_active
)
SELECT
  'Jantar Especial Mensal',
  'Acumule 300 pontos em um mês e ganhe um jantar exclusivo em restaurante especial com sequência completa de pratos.',
  'monthly_challenge',
  1,
  300,
  300,
  'Jantar completo com sequência de pratos em restaurante exclusivo',
  'Inclui entrada, prato principal e sobremesa. Destino e cardápio a confirmar.',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.career_plan_config WHERE plan_type = 'monthly_challenge'
);

INSERT INTO public.career_plan_config (
  name, description, plan_type, duration_months,
  min_monthly_points, required_period_points,
  reward_description, reward_details, is_active
)
SELECT
  'Viagem dos Sonhos — 8 Meses',
  'Acumule 6.000 pontos em até 8 meses e ganhe uma viagem incrível com tudo incluso. Atenção: se não alcançar a meta no período, os pontos são zerados e o ciclo reinicia.',
  'period',
  8,
  0,
  6000,
  'Viagem completa com tudo incluso — destino a definir',
  'Passagem aérea, hospedagem, refeições e passeios inclusos. Destino e datas serão anunciados.',
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.career_plan_config WHERE plan_type = 'period'
);

-- ── 5a. Função: atualiza monthly_rankings incrementalmente ──
CREATE OR REPLACE FUNCTION public.upsert_monthly_ranking_on_sale(
  _coach_id UUID,
  _points   INTEGER,
  _revenue  NUMERIC,
  _month    DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.monthly_rankings (
    coach_id, reference_month, total_points, total_revenue,
    new_students, total_students, is_top_seller, qualifies_for_career_plan
  ) VALUES (
    _coach_id, _month, _points, _revenue,
    0, 0, FALSE, FALSE
  )
  ON CONFLICT (reference_month, coach_id) DO UPDATE
  SET total_points  = public.monthly_rankings.total_points + _points,
      total_revenue = COALESCE(public.monthly_rankings.total_revenue, 0) + _revenue;

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY reference_month
             ORDER BY total_points DESC, total_revenue DESC
           ) AS pos
    FROM public.monthly_rankings
    WHERE reference_month = _month
  )
  UPDATE public.monthly_rankings mr
  SET ranking_position = ranked.pos,
      is_top_seller    = (ranked.pos = 1),
      qualifies_for_career_plan = (
        mr.total_points >= COALESCE(
          (SELECT min_monthly_points FROM public.career_plan_config
           WHERE plan_type = 'monthly_challenge' AND is_active = TRUE
           ORDER BY created_at LIMIT 1),
          300
        )
      )
  FROM ranked
  WHERE mr.id = ranked.id;
END;
$$;

-- ── 5b. Função: atualiza career_plan_progress para planos de período ──
CREATE OR REPLACE FUNCTION public.update_career_period_plans(
  _coach_id UUID,
  _points   INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan     RECORD;
  v_progress RECORD;
BEGIN
  FOR v_plan IN
    SELECT * FROM public.career_plan_config
    WHERE is_active = TRUE AND plan_type = 'period'
  LOOP
    SELECT * INTO v_progress
    FROM public.career_plan_progress
    WHERE coach_id      = _coach_id
      AND career_plan_id = v_plan.id
      AND reward_earned  = FALSE
      AND (period_end IS NULL OR period_end > NOW())
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_progress.id IS NULL THEN
      INSERT INTO public.career_plan_progress (
        coach_id, career_plan_id,
        accumulated_points, period_start, period_end,
        current_streak_active, reward_earned
      ) VALUES (
        _coach_id, v_plan.id,
        _points,
        NOW(),
        NOW() + (v_plan.duration_months || ' months')::INTERVAL,
        TRUE, FALSE
      )
      ON CONFLICT (coach_id, career_plan_id) DO UPDATE
      SET accumulated_points = COALESCE(public.career_plan_progress.accumulated_points, 0) + _points,
          period_start = COALESCE(public.career_plan_progress.period_start, NOW()),
          period_end   = COALESCE(public.career_plan_progress.period_end, NOW() + (v_plan.duration_months || ' months')::INTERVAL),
          current_streak_active = TRUE,
          updated_at = NOW();
    ELSE
      UPDATE public.career_plan_progress
      SET accumulated_points = COALESCE(accumulated_points, 0) + _points,
          reward_earned      = CASE
            WHEN COALESCE(accumulated_points, 0) + _points >= v_plan.required_period_points
            THEN TRUE ELSE FALSE END,
          reward_earned_at   = CASE
            WHEN COALESCE(accumulated_points, 0) + _points >= v_plan.required_period_points
              AND NOT COALESCE(reward_earned, FALSE)
            THEN NOW() ELSE reward_earned_at END,
          updated_at = NOW()
      WHERE id = v_progress.id;
    END IF;
  END LOOP;
END;
$$;

-- ── 5c. Função: atualiza career_challenge_progress ──
CREATE OR REPLACE FUNCTION public.update_career_challenge_progress(
  _coach_id UUID,
  _points   INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenge RECORD;
BEGIN
  FOR v_challenge IN
    SELECT * FROM public.career_challenges
    WHERE is_active  = TRUE
      AND start_date <= CURRENT_DATE
      AND end_date   >= CURRENT_DATE
  LOOP
    INSERT INTO public.career_challenge_progress
      (coach_id, challenge_id, points_in_period)
    VALUES (_coach_id, v_challenge.id, _points)
    ON CONFLICT (challenge_id, coach_id) DO UPDATE
    SET points_in_period = public.career_challenge_progress.points_in_period + _points,
        achieved_at = CASE
          WHEN public.career_challenge_progress.points_in_period + _points
               >= v_challenge.required_points
            AND public.career_challenge_progress.achieved_at IS NULL
          THEN NOW() ELSE public.career_challenge_progress.achieved_at END,
        updated_at = NOW();
  END LOOP;
END;
$$;

-- ── 5d. Atualize process_paid_transaction ──
CREATE OR REPLACE FUNCTION public.process_paid_transaction(_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tx RECORD; product RECORD; student_row RECORD; referring_student RECORD;
  coach_row RECORD; upline1 RECORD; upline2 RECORD; upline3 RECORD; master_row RECORD;
  admin_profile_id UUID; commission_release_days INTEGER := 15;
  app_fee_amount NUMERIC := 0; base_distributable NUMERIC := 0;
  slot RECORD; slot_amount NUMERIC := 0; slot_target UUID;
  slot_count INTEGER := 0; system_fee_total NUMERIC := 0;
  computed_points INTEGER := 0; beneficiary_profile UUID;
  level_idx INTEGER; legacy_referral_amount NUMERIC := 0;
  legacy_network_base NUMERIC := 0; legacy_commission NUMERIC;
  legacy_level_pct NUMERIC; legacy_upline RECORD;
  running_balance NUMERIC := 0; group_snapshot NUMERIC := 0;
  group_total NUMERIC := 0; current_group SMALLINT := -1;
  v_paid_month DATE;
BEGIN
  SELECT * INTO tx FROM public.transactions WHERE id = _transaction_id;
  IF tx.id IS NULL OR tx.status <> 'paid' THEN RETURN; END IF;

  SELECT * INTO product FROM public.products WHERE id = tx.product_id;
  SELECT * INTO student_row FROM public.students WHERE id = tx.student_id;

  IF tx.purchase_type = 'challenge' AND tx.subscription_id IS NULL THEN
    INSERT INTO public.subscriptions (student_id, product_id, start_date, end_date, status, payment_method, installments)
    VALUES (tx.student_id, tx.product_id, CURRENT_DATE,
      CURRENT_DATE + COALESCE(product.duration_days, 30), 'active', tx.payment_method, tx.installments)
    RETURNING id INTO tx.subscription_id;
    UPDATE public.transactions SET subscription_id = tx.subscription_id WHERE id = _transaction_id;
  END IF;

  IF tx.purchase_type = 'digital' AND tx.digital_product_id IS NOT NULL THEN
    INSERT INTO public.digital_purchases (student_id, digital_product_id, amount_paid, access_url, expires_at)
    SELECT tx.student_id, dp.id, tx.gross_amount, dp.content_url, now() + make_interval(days => COALESCE(dp.access_days, 365))
    FROM public.digital_products dp WHERE dp.id = tx.digital_product_id
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COALESCE(value::INTEGER, 15) INTO commission_release_days
  FROM public.app_settings WHERE key = 'commission_release_days';

  DELETE FROM public.commissions WHERE transaction_id = _transaction_id;
  DELETE FROM public.product_order_pool_entries WHERE transaction_id = _transaction_id;
  DELETE FROM public.nutritionist_blocked_entries WHERE transaction_id = _transaction_id AND status = 'blocked';
  DELETE FROM public.coach_points_log WHERE transaction_id = _transaction_id;

  SELECT * INTO coach_row FROM public.coaches WHERE id = student_row.coach_id;
  IF coach_row.id IS NOT NULL AND coach_row.upline_coach_id IS NOT NULL THEN
    SELECT * INTO upline1 FROM public.coaches WHERE id = coach_row.upline_coach_id;
  END IF;
  IF upline1.id IS NOT NULL AND upline1.upline_coach_id IS NOT NULL THEN
    SELECT * INTO upline2 FROM public.coaches WHERE id = upline1.upline_coach_id;
  END IF;
  IF upline2.id IS NOT NULL AND upline2.upline_coach_id IS NOT NULL THEN
    SELECT * INTO upline3 FROM public.coaches WHERE id = upline2.upline_coach_id;
  END IF;
  IF coach_row.id IS NOT NULL THEN
    SELECT * INTO master_row FROM public.master_coaches WHERE coach_id = coach_row.id AND status = 'active' LIMIT 1;
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles
  WHERE role = 'admin' AND COALESCE(is_master_admin, false) = true LIMIT 1;
  IF admin_profile_id IS NULL THEN
    SELECT id INTO admin_profile_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
  END IF;

  SELECT COUNT(*) INTO slot_count FROM public.product_value_slots
  WHERE product_id = tx.product_id AND is_active = true;

  base_distributable := GREATEST(0, COALESCE(tx.gross_amount,0) - COALESCE(tx.payment_fee,0) - COALESCE(tx.tax_amount,0));
  running_balance := base_distributable;
  group_snapshot := base_distributable;

  IF slot_count > 0 THEN
    FOR slot IN
      SELECT * FROM public.product_value_slots
      WHERE product_id = tx.product_id AND is_active = true
      ORDER BY slot_order
    LOOP
      IF slot.slot_group IS DISTINCT FROM current_group THEN
        running_balance := GREATEST(0, running_balance - group_total);
        group_snapshot := running_balance;
        group_total := 0;
        current_group := slot.slot_group;
      END IF;

      slot_amount := ROUND(
        CASE slot.value_type
          WHEN 'fixed' THEN slot.value_amount
          WHEN 'pct_running' THEN group_snapshot * (slot.value_amount / 100.0)
          ELSE base_distributable * (slot.value_amount / 100.0)
        END, 2);

      IF slot_amount <= 0 THEN CONTINUE; END IF;
      group_total := group_total + slot_amount;

      beneficiary_profile := NULL;
      CASE slot.destination
        WHEN 'admin_wallet'        THEN beneficiary_profile := admin_profile_id;
        WHEN 'coach_wallet'        THEN
          IF coach_row.id IS NOT NULL THEN beneficiary_profile := coach_row.profile_id; END IF;
        WHEN 'network_l1'          THEN
          IF upline1.id IS NOT NULL THEN beneficiary_profile := upline1.profile_id; END IF;
        WHEN 'network_l2'          THEN
          IF upline2.id IS NOT NULL THEN beneficiary_profile := upline2.profile_id; END IF;
        WHEN 'network_l3'          THEN
          IF upline3.id IS NOT NULL THEN beneficiary_profile := upline3.profile_id; END IF;
        WHEN 'master_coach_wallet' THEN
          IF master_row.id IS NOT NULL THEN
            SELECT profile_id INTO beneficiary_profile FROM public.coaches WHERE id = master_row.master_coach_id;
          END IF;
        WHEN 'nutritionist_wallet' THEN
          beneficiary_profile := public.find_nutritionist_for(COALESCE(coach_row.id, NULL));
          IF beneficiary_profile IS NOT NULL THEN
            SELECT profile_id INTO beneficiary_profile FROM public.coaches WHERE id = beneficiary_profile;
          END IF;
        ELSE NULL;
      END CASE;

      IF slot.destination = 'nutritionist_wallet' AND beneficiary_profile IS NOT NULL THEN
        INSERT INTO public.nutritionist_blocked_entries (
          transaction_id, profile_id, student_id, product_id, slot_label, amount, status
        ) VALUES (
          _transaction_id, beneficiary_profile, tx.student_id, tx.product_id,
          slot.label, slot_amount, 'blocked'
        );
        UPDATE public.nutritionist_wallets
        SET blocked_balance = COALESCE(blocked_balance, 0) + slot_amount,
            total_earned    = COALESCE(total_earned, 0) + slot_amount,
            updated_at = NOW()
        WHERE profile_id = beneficiary_profile;
        IF NOT FOUND THEN
          INSERT INTO public.nutritionist_wallets (profile_id, blocked_balance, total_earned)
          VALUES (beneficiary_profile, slot_amount, slot_amount)
          ON CONFLICT DO NOTHING;
        END IF;
      ELSIF slot.destination = 'product_order_pool' THEN
        INSERT INTO public.product_order_pool_entries (
          transaction_id, student_id, product_id, slot_label, amount
        ) VALUES (
          _transaction_id, tx.student_id, tx.product_id, slot.label, slot_amount
        );
      ELSIF beneficiary_profile IS NOT NULL THEN
        INSERT INTO public.commissions (
          transaction_id, profile_id, amount,
          status, release_at, slot_label,
          is_blocked_until_delivery
        ) VALUES (
          _transaction_id, beneficiary_profile, slot_amount,
          CASE WHEN slot.is_blocked_until_delivery THEN 'blocked' ELSE 'pending' END,
          CASE WHEN NOT slot.is_blocked_until_delivery
               THEN NOW() + (commission_release_days || ' days')::INTERVAL
               ELSE NULL END,
          slot.label,
          slot.is_blocked_until_delivery
        );
      END IF;
    END LOOP;
  END IF;

  computed_points := COALESCE(product.points_per_sale, 0);
  IF computed_points > 0 AND coach_row.id IS NOT NULL THEN
    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata)
    VALUES (coach_row.id, _transaction_id, tx.product_id, computed_points, 'sale',
            jsonb_build_object('product_name', product.name, 'gross_amount', tx.gross_amount));

    UPDATE public.coaches
    SET total_points = COALESCE(total_points, 0) + computed_points
    WHERE id = coach_row.id;

    v_paid_month := date_trunc('month', COALESCE(tx.paid_at, NOW()))::DATE;
    PERFORM public.upsert_monthly_ranking_on_sale(
      coach_row.id,
      computed_points,
      COALESCE(tx.net_amount, tx.gross_amount, 0),
      v_paid_month
    );

    PERFORM public.update_career_period_plans(coach_row.id, computed_points);
    PERFORM public.update_career_challenge_progress(coach_row.id, computed_points);
  END IF;

  IF coach_row.id IS NOT NULL THEN
    UPDATE public.coaches
    SET total_sales = COALESCE(total_sales, 0) + 1
    WHERE id = coach_row.id;
  END IF;

END;
$function$;

REVOKE EXECUTE ON FUNCTION public.process_paid_transaction(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_paid_transaction(UUID) TO service_role;

-- ── 6. Reset de ciclos expirados ──
CREATE OR REPLACE FUNCTION public.reset_expired_career_period_plans()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.career_plan_progress
  SET accumulated_points     = 0,
      current_streak_active  = FALSE,
      period_start           = NULL,
      period_end             = NULL,
      consecutive_months_qualified = 0,
      updated_at             = NOW()
  WHERE reward_earned = FALSE
    AND period_end IS NOT NULL
    AND period_end < NOW();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reset_expired_career_period_plans() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.reset_expired_career_period_plans() TO service_role;

-- ── 7. RLS ──
ALTER TABLE public.career_plan_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS career_plan_admin_all  ON public.career_plan_config;
DROP POLICY IF EXISTS career_plan_read_auth  ON public.career_plan_config;
CREATE POLICY career_plan_admin_all ON public.career_plan_config
  FOR ALL TO public
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY career_plan_read_auth ON public.career_plan_config
  FOR SELECT TO authenticated USING (TRUE);

ALTER TABLE public.career_plan_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cpp_admin_all ON public.career_plan_progress;
DROP POLICY IF EXISTS cpp_own_select ON public.career_plan_progress;
CREATE POLICY cpp_admin_all ON public.career_plan_progress
  FOR ALL TO public
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY cpp_own_select ON public.career_plan_progress
  FOR SELECT TO authenticated
  USING (coach_id = public.current_coach_id());