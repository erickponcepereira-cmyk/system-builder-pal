CREATE TABLE IF NOT EXISTS public.wallet_advance_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advance_id uuid NOT NULL REFERENCES public.wallet_advances(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL,
  origin text NOT NULL DEFAULT 'manual',
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallet_advance_settlements TO authenticated;
GRANT ALL ON public.wallet_advance_settlements TO service_role;

ALTER TABLE public.wallet_advance_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallet_advance_settlements_owner_read" ON public.wallet_advance_settlements;
CREATE POLICY "wallet_advance_settlements_owner_read"
ON public.wallet_advance_settlements FOR SELECT TO authenticated
USING (
  profile_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
  OR public.is_admin(auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_wallet_advance_settlements_profile
  ON public.wallet_advance_settlements(profile_id, created_at DESC);

-- Baixa FIFO de adiantamentos em aberto
CREATE OR REPLACE FUNCTION public.settle_advances_for_profile(
  _profile_id uuid,
  _amount numeric,
  _origin text DEFAULT 'manual',
  _reference_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_left numeric := GREATEST(COALESCE(_amount, 0), 0);
  v_total numeric := 0;
  v_take numeric;
  r RECORD;
BEGIN
  IF _profile_id IS NULL OR v_left <= 0 THEN RETURN 0; END IF;

  FOR r IN
    SELECT id, GREATEST(amount - settled_amount, 0) AS open_amount
    FROM public.wallet_advances
    WHERE profile_id = _profile_id
      AND GREATEST(amount - settled_amount, 0) > 0
    ORDER BY created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_left <= 0;
    v_take := LEAST(r.open_amount, v_left);
    IF v_take <= 0 THEN CONTINUE; END IF;

    UPDATE public.wallet_advances
    SET settled_amount = settled_amount + v_take, updated_at = now()
    WHERE id = r.id;

    INSERT INTO public.wallet_advance_settlements (advance_id, profile_id, amount, origin, reference_id)
    VALUES (r.id, _profile_id, v_take, COALESCE(_origin, 'manual'), _reference_id);

    v_left := v_left - v_take;
    v_total := v_total + v_take;
  END LOOP;

  RETURN round(v_total, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_advances_for_profile(uuid, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_advances_for_profile(uuid, numeric, text, uuid) TO service_role;

-- Saldo bruto (antes do adiantamento) de um perfil, usado para decidir a baixa
CREATE OR REPLACE FUNCTION public.wallet_base_available(_profile_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE((SELECT wal.available_balance FROM public.wallets wal WHERE wal.profile_id = _profile_id), 0)
       + COALESCE((SELECT SUM(pw.available_balance) FROM public.partner_wallets pw
                    JOIN public.partners p ON p.id = pw.partner_id
                   WHERE p.profile_id = _profile_id), 0)
       + COALESCE((SELECT SUM(profw.available_balance) FROM public.professional_wallets profw
                    JOIN public.coaches c ON c.id = profw.professional_coach_id
                   WHERE c.profile_id = _profile_id), 0);
$$;

REVOKE ALL ON FUNCTION public.wallet_base_available(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_base_available(uuid) TO service_role;

-- Baixa automática ao pagar saque
CREATE OR REPLACE FUNCTION public.admin_mark_withdrawal_paid(_withdrawal_id uuid, _admin_user_id uuid, _notes text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
  admin_profile_id uuid;
  v_available numeric := 0;
  v_reserved_self numeric := 0;
  v_open_advance numeric := 0;
  v_base numeric := 0;
BEGIN
  IF NOT public.is_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles WHERE user_id = _admin_user_id;

  SELECT * INTO w
  FROM public.withdrawal_requests
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF w.id IS NULL THEN
    RAISE EXCEPTION 'Saque não encontrado';
  END IF;

  IF w.status NOT IN ('approved', 'processing', 'requested') THEN
    RAISE EXCEPTION 'Apenas saques aprovados podem ser marcados como pagos';
  END IF;

  SELECT
    COALESCE((SELECT wal.available_balance FROM public.wallets wal
               WHERE wal.profile_id = w.profile_id), 0)
  + COALESCE((SELECT SUM(pw.available_balance) FROM public.partner_wallets pw
               JOIN public.partners p ON p.id = pw.partner_id
              WHERE p.profile_id = w.profile_id), 0)
  + COALESCE((SELECT SUM(profw.available_balance) FROM public.professional_wallets profw
               JOIN public.coaches c ON c.id = profw.professional_coach_id
              WHERE c.profile_id = w.profile_id), 0)
  + COALESCE((SELECT SUM(sw.available_balance) FROM public.student_wallets sw
               JOIN public.students s ON s.id = sw.student_id
              WHERE s.profile_id = w.profile_id), 0)
  INTO v_available;

  v_reserved_self := round(COALESCE(w.amount, 0)::numeric, 2);

  IF round(COALESCE(v_available, 0)::numeric, 2) + v_reserved_self + 0.001
     < round(w.amount::numeric, 2) THEN
    RAISE EXCEPTION 'Saldo disponível insuficiente (disponível R$ %, reservado para este saque R$ %)',
      to_char(COALESCE(v_available, 0), 'FM999999990.00'),
      to_char(v_reserved_self, 'FM999999990.00');
  END IF;

  UPDATE public.withdrawal_requests
  SET status      = 'paid',
      notes       = COALESCE(_notes, notes),
      approved_at = COALESCE(approved_at, now()),
      paid_at     = now(),
      approved_by = admin_profile_id
  WHERE id = _withdrawal_id;

  PERFORM public.recalc_wallets_for_owner(w.profile_id);

  -- Quitação automática (FIFO) dos adiantamentos em aberto quando o saldo
  -- bruto remanescente já cobre o valor adiantado. Não altera o "disponível":
  -- o extrato desconta adiantamento aberto + quitado.
  SELECT COALESCE(SUM(GREATEST(amount - settled_amount, 0)), 0)
    INTO v_open_advance
  FROM public.wallet_advances WHERE profile_id = w.profile_id;

  IF v_open_advance > 0 THEN
    v_base := public.wallet_base_available(w.profile_id);
    IF v_base > 0 THEN
      PERFORM public.settle_advances_for_profile(
        w.profile_id, LEAST(v_open_advance, v_base), 'withdrawal_paid', _withdrawal_id
      );
    END IF;
  END IF;
END;
$function$;

-- Extrato: expõe adiantamento aberto, quitado e total (disponível inalterado)
CREATE OR REPLACE FUNCTION public.wallet_statement(_profile_id uuid, _recalc boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_partner_ids uuid[];
  v_coach_ids uuid[];
  v_student_ids uuid[];

  v_main_avail numeric := 0;
  v_main_pend numeric := 0;
  v_main_earned numeric := 0;
  v_main_withdrawn numeric := 0;

  v_p_avail numeric := 0;
  v_p_pend numeric := 0;
  v_p_earned numeric := 0;
  v_p_withdrawn numeric := 0;

  v_pro_avail numeric := 0;
  v_pro_pend numeric := 0;
  v_pro_earned numeric := 0;
  v_pro_withdrawn numeric := 0;

  v_creator_avail numeric := 0;
  v_creator_pend numeric := 0;
  v_creator_earned numeric := 0;
  v_creator_withdrawn numeric := 0;

  v_ref_avail numeric := 0;
  v_ref_pend numeric := 0;
  v_ref_earned numeric := 0;

  v_hold numeric := 0;
  v_hold_total numeric := 0;
  v_net_blocked numeric := 0;
  v_comm_released numeric := 0;

  v_wd_paid numeric := 0;
  v_wd_open numeric := 0;
  v_spent numeric := 0;
  v_advance numeric := 0;
  v_advance_settled numeric := 0;
  v_advance_amount numeric := 0;
  v_base_avail numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = _profile_id;

  SELECT array_agg(id) INTO v_partner_ids FROM public.partners WHERE profile_id = _profile_id;
  SELECT array_agg(id) INTO v_coach_ids   FROM public.coaches  WHERE profile_id = _profile_id;
  SELECT array_agg(id) INTO v_student_ids FROM public.students WHERE profile_id = _profile_id;

  SELECT COALESCE(available_balance,0), COALESCE(pending_balance,0),
         COALESCE(total_earned,0), COALESCE(total_withdrawn,0)
    INTO v_main_avail, v_main_pend, v_main_earned, v_main_withdrawn
  FROM public.wallets WHERE profile_id = _profile_id;

  IF v_partner_ids IS NOT NULL THEN
    SELECT COALESCE(SUM(available_balance),0), COALESCE(SUM(pending_balance),0),
           COALESCE(SUM(total_earned),0), COALESCE(SUM(total_withdrawn),0)
      INTO v_p_avail, v_p_pend, v_p_earned, v_p_withdrawn
    FROM public.partner_wallets WHERE partner_id = ANY(v_partner_ids);
  END IF;

  IF v_coach_ids IS NOT NULL THEN
    SELECT COALESCE(SUM(available_balance),0), COALESCE(SUM(pending_balance),0),
           COALESCE(SUM(total_earned),0), COALESCE(SUM(total_withdrawn),0)
      INTO v_pro_avail, v_pro_pend, v_pro_earned, v_pro_withdrawn
    FROM public.professional_wallets WHERE professional_coach_id = ANY(v_coach_ids);
  END IF;

  v_creator_avail := v_p_avail + v_pro_avail;
  v_creator_pend := v_p_pend + v_pro_pend;
  v_creator_earned := v_p_earned + v_pro_earned;
  v_creator_withdrawn := v_p_withdrawn + v_pro_withdrawn;

  IF v_student_ids IS NOT NULL THEN
    SELECT COALESCE(SUM(available_balance),0), COALESCE(SUM(pending_balance),0), COALESCE(SUM(total_earned),0)
      INTO v_ref_avail, v_ref_pend, v_ref_earned
    FROM public.student_wallets WHERE student_id = ANY(v_student_ids);
  END IF;

  WITH src AS (
    SELECT
      c.amount,
      COALESCE(c.is_network, false) AS is_network,
      COALESCE(c.force_released, false) AS forced,
      COALESCE((
        SELECT nuh.any_completed
        FROM public.network_unlock_history nuh
        WHERE nuh.profile_id = _profile_id
          AND nuh.period_year  = EXTRACT(YEAR  FROM (c.created_at AT TIME ZONE 'UTC'))::int
          AND nuh.period_month = EXTRACT(MONTH FROM (c.created_at AT TIME ZONE 'UTC'))::int
      ), false) AS month_unlocked,
      (
        c.status::text IN ('available','withdrawn','paid')
        OR (c.status::text = 'pending' AND c.available_at IS NOT NULL AND c.available_at <= now())
      ) AS is_released
    FROM public.commissions c
    WHERE c.beneficiary_profile_id = _profile_id
      AND COALESCE(c.is_referral, false) = false
      AND COALESCE(c.slot_label, '') !~* '^(sistema|admin|nutri)'
      AND c.status::text IN ('pending','available','withdrawn','paid')
  )
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE NOT forced AND NOT is_released), 0),
    COALESCE(SUM(amount) FILTER (WHERE NOT forced AND is_released AND is_network AND NOT month_unlocked), 0),
    COALESCE(SUM(amount) FILTER (WHERE forced OR (is_released AND (NOT is_network OR month_unlocked))), 0)
  INTO v_hold, v_net_blocked, v_comm_released
  FROM src;

  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0),
         COALESCE(SUM(amount) FILTER (WHERE status IN ('requested','approved','processing')), 0)
    INTO v_wd_paid, v_wd_open
  FROM public.withdrawal_requests WHERE profile_id = _profile_id;

  IF v_student_ids IS NOT NULL THEN
    SELECT v_wd_paid + COALESCE(SUM(amount) FILTER (WHERE status::text = 'paid'), 0),
           v_wd_open + COALESCE(SUM(amount) FILTER (WHERE status::text IN ('requested','approved','processing')), 0)
      INTO v_wd_paid, v_wd_open
    FROM public.student_withdrawal_requests WHERE student_id = ANY(v_student_ids);
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_spent
    FROM public.subscription_invoices
    WHERE user_id = v_user_id AND status = 'paid' AND payment_method = 'wallet';
  END IF;

  IF v_student_ids IS NOT NULL THEN
    SELECT v_spent
      + COALESCE((SELECT SUM(total_amount) FROM public.store_orders
                  WHERE student_id = ANY(v_student_ids) AND status::text = 'paid' AND payment_method::text = 'wallet'), 0)
      + COALESCE((SELECT SUM(gross_amount) FROM public.partner_product_orders
                  WHERE student_id = ANY(v_student_ids) AND status = 'paid' AND payment_method = 'wallet'), 0)
      INTO v_spent;
  END IF;

  SELECT COALESCE(SUM(GREATEST(amount - settled_amount, 0)), 0),
         COALESCE(SUM(LEAST(settled_amount, amount)), 0),
         COALESCE(SUM(amount), 0)
    INTO v_advance, v_advance_settled, v_advance_amount
  FROM public.wallet_advances WHERE profile_id = _profile_id;

  -- Fitcoin (indicação do aluno) NÃO entra no saldo profissional.
  v_base_avail := v_main_avail + v_creator_avail;
  -- Carência = coach (comissões ainda no prazo) + parceiro + profissional.
  v_hold_total := v_hold + v_creator_pend;

  RETURN jsonb_build_object(
    'profile_id', _profile_id,
    'generated_at', now(),
    -- adiantamento total (aberto + quitado) segue descontado: o dinheiro já saiu.
    'available', round(GREATEST(v_base_avail - v_advance_amount, 0)::numeric, 2),
    'available_before_advance', round(v_base_avail::numeric, 2),
    'advance_open', round(v_advance::numeric, 2),
    'advance_settled', round(v_advance_settled::numeric, 2),
    'advance_total', round(v_advance_amount::numeric, 2),
    'hold', round(v_hold_total::numeric, 2),
    'hold_coach', round(v_hold::numeric, 2),
    'network_blocked', round(v_net_blocked::numeric, 2),
    'pending_total', round((v_hold_total + v_net_blocked)::numeric, 2),
    'withdraw_open', round(v_wd_open::numeric, 2),
    'withdrawn_paid', round(v_wd_paid::numeric, 2),
    'spent_wallet', round(v_spent::numeric, 2),
    'total_earned', round((v_main_earned + v_creator_earned)::numeric, 2),
    'sources', jsonb_build_object(
      'coach', jsonb_build_object(
        'available', round(v_main_avail::numeric, 2),
        'hold', round(v_hold::numeric, 2),
        'earned', round(v_main_earned::numeric, 2)
      ),
      'partner', jsonb_build_object(
        'available', round(v_p_avail::numeric, 2),
        'hold', round(v_p_pend::numeric, 2),
        'earned', round(v_p_earned::numeric, 2)
      ),
      'professional', jsonb_build_object(
        'available', round(v_pro_avail::numeric, 2),
        'hold', round(v_pro_pend::numeric, 2),
        'earned', round(v_pro_earned::numeric, 2)
      )
    ),
    'fitcoin', jsonb_build_object(
      'available', round(v_ref_avail::numeric, 2),
      'pending', round(v_ref_pend::numeric, 2),
      'earned', round(v_ref_earned::numeric, 2)
    ),
    'breakdown', jsonb_build_object(
      'commissions', jsonb_build_object(
        'available', round(v_main_avail::numeric, 2),
        'pending', round(v_hold::numeric, 2),
        'released_total', round(v_comm_released::numeric, 2),
        'earned', round(v_main_earned::numeric, 2),
        'withdrawn', round(v_main_withdrawn::numeric, 2)
      ),
      'creator', jsonb_build_object(
        'available', round(v_creator_avail::numeric, 2),
        'pending', round(v_creator_pend::numeric, 2),
        'earned', round(v_creator_earned::numeric, 2),
        'withdrawn', round(v_creator_withdrawn::numeric, 2)
      ),
      'referral', jsonb_build_object(
        'available', round(v_ref_avail::numeric, 2),
        'pending', round(v_ref_pend::numeric, 2),
        'earned', round(v_ref_earned::numeric, 2)
      )
    )
  );
END;
$function$;