ALTER TABLE public.subscription_invoices
  ADD COLUMN IF NOT EXISTS wallet_debit_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.debit_user_wallets_cascade(_profile_id uuid, _amount numeric, _note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining numeric := round(COALESCE(_amount, 0)::numeric, 2);
  v_bal numeric := 0;
  v_take numeric := 0;
  v_partner_id uuid;
  v_coach_id uuid;
  v_breakdown jsonb := '{}'::jsonb;
BEGIN
  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil inválido';
  END IF;
  IF v_remaining <= 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  SELECT COALESCE(available_balance, 0) INTO v_bal
  FROM public.wallets
  WHERE profile_id = _profile_id
  FOR UPDATE;
  v_bal := COALESCE(v_bal, 0);
  IF v_bal > 0 AND v_remaining > 0 THEN
    v_take := LEAST(v_bal, v_remaining);
    UPDATE public.wallets
      SET available_balance = round((COALESCE(available_balance, 0) - v_take)::numeric, 2),
          updated_at = now()
      WHERE profile_id = _profile_id;
    INSERT INTO public.fitcoin_ledger (profile_id, amount, source, description, created_at)
      VALUES (_profile_id, -v_take, 'wallet_debit', COALESCE(_note,'Débito carteira coach'), now())
      ON CONFLICT DO NOTHING;
    v_breakdown := v_breakdown || jsonb_build_object('coach', v_take);
    v_remaining := round((v_remaining - v_take)::numeric, 2);
  END IF;

  IF v_remaining > 0 THEN
    SELECT id INTO v_partner_id FROM public.partners WHERE profile_id = _profile_id LIMIT 1;
    IF v_partner_id IS NOT NULL THEN
      SELECT COALESCE(available_balance, 0) INTO v_bal
      FROM public.partner_wallets
      WHERE partner_id = v_partner_id
      FOR UPDATE;
      v_bal := COALESCE(v_bal, 0);
      IF v_bal > 0 THEN
        v_take := LEAST(v_bal, v_remaining);
        UPDATE public.partner_wallets
          SET available_balance = round((COALESCE(available_balance, 0) - v_take)::numeric, 2),
              updated_at = now()
          WHERE partner_id = v_partner_id;
        v_breakdown := v_breakdown || jsonb_build_object('partner', v_take);
        v_remaining := round((v_remaining - v_take)::numeric, 2);
      END IF;
    END IF;
  END IF;

  IF v_remaining > 0 THEN
    SELECT id INTO v_coach_id FROM public.coaches WHERE profile_id = _profile_id LIMIT 1;
    IF v_coach_id IS NOT NULL THEN
      SELECT COALESCE(available_balance, 0) INTO v_bal
      FROM public.professional_wallets
      WHERE professional_coach_id = v_coach_id
      FOR UPDATE;
      v_bal := COALESCE(v_bal, 0);
      IF v_bal > 0 THEN
        v_take := LEAST(v_bal, v_remaining);
        UPDATE public.professional_wallets
          SET available_balance = round((COALESCE(available_balance, 0) - v_take)::numeric, 2),
              updated_at = now()
          WHERE professional_coach_id = v_coach_id;
        v_breakdown := v_breakdown || jsonb_build_object('professional', v_take);
        v_remaining := round((v_remaining - v_take)::numeric, 2);
      END IF;
    END IF;
  END IF;

  IF v_remaining > 0.01 THEN
    RAISE EXCEPTION 'Saldo insuficiente nas carteiras (faltam R$ %)', to_char(v_remaining, 'FM999999990.00');
  END IF;

  RETURN v_breakdown;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_wallets_for_owner(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_pending numeric := 0;
  v_available_main_raw numeric := 0;
  v_total_earned_main numeric := 0;
  v_referral_pending numeric := 0;
  v_paid_seller numeric := 0;
  v_reserved_seller numeric := 0;

  v_partner_id uuid;
  v_partner_avail_raw numeric := 0;
  v_partner_pending numeric := 0;
  v_partner_earned numeric := 0;

  v_coach_id uuid;
  v_coach_avail_raw numeric := 0;
  v_coach_pending numeric := 0;
  v_coach_earned numeric := 0;

  v_absorbed_main_paid numeric := 0;
  v_absorbed_partner_paid numeric := 0;
  v_absorbed_coach_paid numeric := 0;
  v_take_main_res numeric := 0;
  v_take_partner_res numeric := 0;
  v_take_coach_res numeric := 0;

  v_main_final numeric := 0;
  v_partner_final numeric := 0;
  v_coach_final numeric := 0;

  v_leftover numeric := 0;
  v_take numeric := 0;

  v_sub_main numeric := 0;
  v_sub_partner numeric := 0;
  v_sub_coach numeric := 0;
  v_store_main numeric := 0;
  v_store_partner numeric := 0;
  v_store_coach numeric := 0;
  v_partner_order_main numeric := 0;
  v_partner_order_partner numeric := 0;
  v_partner_order_coach numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN; END IF;

  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = _profile_id;

  WITH src AS (
    SELECT
      c.amount,
      c.status::text AS status,
      c.available_at,
      c.created_at,
      (
        COALESCE(c.level, 0) > 0
        OR (
          COALESCE(c.slot_label, '') ~* '(^|\s)(linha|upline)\s*[0-9]+'
          AND COALESCE(c.slot_label, '') !~* 'sem\s+upline'
        )
      ) AS is_network,
      COALESCE((
        SELECT nuh.any_completed
        FROM public.network_unlock_history nuh
        WHERE nuh.profile_id = _profile_id
          AND nuh.period_year  = EXTRACT(YEAR  FROM (c.created_at AT TIME ZONE 'UTC'))::int
          AND nuh.period_month = EXTRACT(MONTH FROM (c.created_at AT TIME ZONE 'UTC'))::int
      ), false) AS month_unlocked,
      (
        c.status::text = 'available'
        OR (c.status::text = 'pending' AND c.available_at IS NOT NULL AND c.available_at <= now())
      ) AS is_released
    FROM public.commissions c
    WHERE c.beneficiary_profile_id = _profile_id
      AND COALESCE(c.is_referral, false) = false
      AND COALESCE(c.slot_label, '') !~* '^(sistema|admin|nutri)'
      AND c.status::text IN ('pending','available','withdrawn')
  )
  SELECT
    COALESCE(SUM(amount) FILTER (
      WHERE status IN ('pending','available')
        AND (NOT is_released OR (is_network AND NOT month_unlocked))
    ), 0),
    COALESCE(SUM(amount) FILTER (
      WHERE is_released AND (NOT is_network OR month_unlocked)
    ), 0),
    COALESCE(SUM(amount), 0)
  INTO v_pending, v_available_main_raw, v_total_earned_main
  FROM src;

  SELECT COALESCE(SUM(amount), 0) INTO v_referral_pending
  FROM public.commissions
  WHERE beneficiary_profile_id = _profile_id
    AND COALESCE(is_referral, false) = true
    AND status::text = 'pending';

  v_pending := v_pending + v_referral_pending;
  v_total_earned_main := v_total_earned_main + v_referral_pending;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_seller
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND partner_id IS NULL AND professional_coach_id IS NULL
    AND status = 'paid';

  SELECT COALESCE(SUM(amount), 0) INTO v_reserved_seller
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND partner_id IS NULL AND professional_coach_id IS NULL
    AND status IN ('requested','approved','processing');

  IF v_user_id IS NOT NULL THEN
    SELECT
      COALESCE(SUM(CASE
        WHEN COALESCE(wallet_debit_breakdown, '{}'::jsonb) <> '{}'::jsonb
          THEN COALESCE((wallet_debit_breakdown->>'coach')::numeric, 0)
        WHEN wallet_source = 'coach' THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE
        WHEN COALESCE(wallet_debit_breakdown, '{}'::jsonb) <> '{}'::jsonb
          THEN COALESCE((wallet_debit_breakdown->>'partner')::numeric, 0)
        WHEN wallet_source = 'partner' THEN amount ELSE 0 END), 0),
      COALESCE(SUM(CASE
        WHEN COALESCE(wallet_debit_breakdown, '{}'::jsonb) <> '{}'::jsonb
          THEN COALESCE((wallet_debit_breakdown->>'professional')::numeric, 0)
        WHEN wallet_source = 'professional' THEN amount ELSE 0 END), 0)
    INTO v_sub_main, v_sub_partner, v_sub_coach
    FROM public.subscription_invoices
    WHERE user_id = v_user_id
      AND status = 'paid'
      AND payment_method = 'wallet';
  END IF;

  SELECT id INTO v_partner_id FROM public.partners WHERE profile_id = _profile_id LIMIT 1;
  IF v_partner_id IS NOT NULL THEN
    WITH src AS (
      SELECT COALESCE(partner_net_amount, 0) AS amount,
             (COALESCE(paid_at, created_at) + interval '7 days') <= now() AS released
      FROM public.partner_product_orders
      WHERE partner_id = v_partner_id AND status = 'paid'
    )
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE released), 0),
      COALESCE(SUM(amount) FILTER (WHERE NOT released), 0),
      COALESCE(SUM(amount), 0)
    INTO v_partner_avail_raw, v_partner_pending, v_partner_earned FROM src;
  END IF;

  SELECT id INTO v_coach_id FROM public.coaches WHERE profile_id = _profile_id LIMIT 1;
  IF v_coach_id IS NOT NULL THEN
    WITH src AS (
      SELECT COALESCE(partner_net_amount, 0) AS amount,
             (COALESCE(paid_at, created_at) + interval '7 days') <= now() AS released
      FROM public.partner_product_orders
      WHERE professional_coach_id = v_coach_id AND status = 'paid'
    )
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE released), 0),
      COALESCE(SUM(amount) FILTER (WHERE NOT released), 0),
      COALESCE(SUM(amount), 0)
    INTO v_coach_avail_raw, v_coach_pending, v_coach_earned FROM src;
  END IF;

  SELECT
    COALESCE(SUM(COALESCE((so.wallet_debit_breakdown->>'coach')::numeric, 0)), 0),
    COALESCE(SUM(COALESCE((so.wallet_debit_breakdown->>'partner')::numeric, 0)), 0),
    COALESCE(SUM(COALESCE((so.wallet_debit_breakdown->>'professional')::numeric, 0)), 0)
  INTO v_store_main, v_store_partner, v_store_coach
  FROM public.store_orders so
  JOIN public.students s ON s.id = so.student_id
  WHERE s.profile_id = _profile_id
    AND so.status = 'paid'
    AND so.payment_method::text = 'wallet';

  SELECT
    COALESCE(SUM(COALESCE((po.wallet_debit_breakdown->>'coach')::numeric, 0)), 0),
    COALESCE(SUM(COALESCE((po.wallet_debit_breakdown->>'partner')::numeric, 0)), 0),
    COALESCE(SUM(COALESCE((po.wallet_debit_breakdown->>'professional')::numeric, 0)), 0)
  INTO v_partner_order_main, v_partner_order_partner, v_partner_order_coach
  FROM public.partner_product_orders po
  JOIN public.students s ON s.id = po.student_id
  WHERE s.profile_id = _profile_id
    AND po.status = 'paid'
    AND po.payment_method = 'wallet';

  v_sub_main := v_sub_main + v_store_main + v_partner_order_main;
  v_sub_partner := v_sub_partner + v_store_partner + v_partner_order_partner;
  v_sub_coach := v_sub_coach + v_store_coach + v_partner_order_coach;

  v_leftover := v_sub_main;
  v_take := LEAST(v_available_main_raw, v_leftover);
  v_absorbed_main_paid := v_absorbed_main_paid + v_take;
  v_available_main_raw := v_available_main_raw - v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_partner_avail_raw, v_leftover);
  v_absorbed_partner_paid := v_absorbed_partner_paid + v_take;
  v_partner_avail_raw := v_partner_avail_raw - v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_coach_avail_raw, v_leftover);
  v_absorbed_coach_paid := v_absorbed_coach_paid + v_take;
  v_coach_avail_raw := v_coach_avail_raw - v_take;

  v_take := LEAST(v_partner_avail_raw, v_sub_partner);
  v_absorbed_partner_paid := v_absorbed_partner_paid + v_take;
  v_partner_avail_raw := v_partner_avail_raw - v_take;

  v_take := LEAST(v_coach_avail_raw, v_sub_coach);
  v_absorbed_coach_paid := v_absorbed_coach_paid + v_take;
  v_coach_avail_raw := v_coach_avail_raw - v_take;

  v_leftover := v_paid_seller;
  v_take := LEAST(v_available_main_raw, v_leftover);
  v_absorbed_main_paid := v_absorbed_main_paid + v_take;
  v_available_main_raw := v_available_main_raw - v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_partner_avail_raw, v_leftover);
  v_absorbed_partner_paid := v_absorbed_partner_paid + v_take;
  v_partner_avail_raw := v_partner_avail_raw - v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_coach_avail_raw, v_leftover);
  v_absorbed_coach_paid := v_absorbed_coach_paid + v_take;
  v_coach_avail_raw := v_coach_avail_raw - v_take;

  v_leftover := v_reserved_seller;
  v_take := LEAST(v_available_main_raw, v_leftover);
  v_take_main_res := v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_partner_avail_raw, v_leftover);
  v_take_partner_res := v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_coach_avail_raw, v_leftover);
  v_take_coach_res := v_take;

  v_main_final    := GREATEST(0, round((v_available_main_raw - v_take_main_res)::numeric, 2));
  v_partner_final := GREATEST(0, round((v_partner_avail_raw   - v_take_partner_res)::numeric, 2));
  v_coach_final   := GREATEST(0, round((v_coach_avail_raw     - v_take_coach_res)::numeric, 2));

  INSERT INTO public.wallets (profile_id, pending_balance, available_balance, total_earned, total_withdrawn, updated_at)
  VALUES (_profile_id, round(v_pending::numeric, 2), v_main_final, round(v_total_earned_main::numeric, 2), round(v_absorbed_main_paid::numeric, 2), now())
  ON CONFLICT (profile_id) DO UPDATE
  SET pending_balance=EXCLUDED.pending_balance,
      available_balance=EXCLUDED.available_balance,
      total_earned=EXCLUDED.total_earned,
      total_withdrawn=EXCLUDED.total_withdrawn,
      updated_at=now();

  IF v_partner_id IS NOT NULL THEN
    INSERT INTO public.partner_wallets (partner_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (v_partner_id, v_partner_final, round(v_partner_pending::numeric, 2), round(v_partner_earned::numeric, 2), round(v_absorbed_partner_paid::numeric, 2), now())
    ON CONFLICT (partner_id) DO UPDATE
    SET available_balance=EXCLUDED.available_balance,
        pending_balance=EXCLUDED.pending_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END IF;

  IF v_coach_id IS NOT NULL THEN
    INSERT INTO public.professional_wallets (professional_coach_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (v_coach_id, v_coach_final, round(v_coach_pending::numeric, 2), round(v_coach_earned::numeric, 2), round(v_absorbed_coach_paid::numeric, 2), now())
    ON CONFLICT (professional_coach_id) DO UPDATE
    SET available_balance=EXCLUDED.available_balance,
        pending_balance=EXCLUDED.pending_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_subscription_invoice_payment(_invoice_id uuid, _method invoice_payment_method, _wallet_source text DEFAULT NULL::text, _performed_by uuid DEFAULT NULL::uuid, _fee_amount numeric DEFAULT 0, _mp_payment_id text DEFAULT NULL::text)
RETURNS public.subscription_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inv public.subscription_invoices;
  v_tax numeric;
  v_net numeric;
  v_remaining numeric;
  v_user uuid;
  v_profile_id uuid;
  v_breakdown jsonb := '{}'::jsonb;
BEGIN
  SELECT * INTO inv FROM public.subscription_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.status = 'paid' THEN RETURN inv; END IF;

  v_user := inv.user_id;
  v_remaining := inv.amount - COALESCE(_fee_amount, 0);
  v_tax := round((v_remaining * 0.06)::numeric, 2);
  v_net := round((v_remaining - v_tax)::numeric, 2);

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_user;

  IF _method = 'wallet' THEN
    IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
    v_breakdown := public.debit_user_wallets_cascade(v_profile_id, inv.amount, 'Mensalidade paga com carteira');
  END IF;

  INSERT INTO public.admin_system_wallet(id, available_balance, total_earned)
  VALUES (true, v_net, v_net)
  ON CONFLICT (id) DO UPDATE
    SET available_balance = admin_system_wallet.available_balance + EXCLUDED.available_balance,
        total_earned = admin_system_wallet.total_earned + EXCLUDED.total_earned,
        updated_at = now();

  INSERT INTO public.admin_system_wallet_entries(slot_label, amount, kind, notes, subscription_invoice_id)
  VALUES ('Mensalidade Recorrente', v_net, 'subscription',
          'Mensalidade ' || to_char(inv.reference_month, 'MM/YYYY'),
          inv.id);

  IF _fee_amount > 0 THEN
    INSERT INTO public.admin_system_wallet_entries(slot_label, amount, kind, notes, subscription_invoice_id)
    VALUES ('Taxa de Pagamento', -_fee_amount, 'payment_fee',
            'Mensalidade ' || to_char(inv.reference_month, 'MM/YYYY'), inv.id);
  END IF;
  IF v_tax > 0 THEN
    INSERT INTO public.admin_system_wallet_entries(slot_label, amount, kind, notes, subscription_invoice_id)
    VALUES ('Imposto Simples Nacional', -v_tax, 'tax',
            'Mensalidade ' || to_char(inv.reference_month, 'MM/YYYY'), inv.id);
  END IF;

  UPDATE public.subscription_invoices
  SET status = 'paid', paid_at = now(),
      payment_method = _method,
      wallet_source = CASE WHEN _method = 'wallet' THEN COALESCE(NULLIF(_wallet_source, ''), 'mixed') ELSE _wallet_source END,
      wallet_debit_breakdown = CASE WHEN _method = 'wallet' THEN v_breakdown ELSE COALESCE(wallet_debit_breakdown, '{}'::jsonb) END,
      fee_amount = COALESCE(_fee_amount, 0), tax_amount = v_tax, net_to_admin = v_net,
      mp_payment_id = _mp_payment_id, updated_at = now()
  WHERE id = _invoice_id
  RETURNING * INTO inv;

  IF _method = 'wallet' AND v_profile_id IS NOT NULL THEN
    PERFORM public.recalc_wallets_for_owner(v_profile_id);
  END IF;

  INSERT INTO public.subscription_payment_log(invoice_id, user_id, action, performed_by, details)
  VALUES (inv.id, v_user, 'paid', _performed_by,
          jsonb_build_object('method', _method, 'wallet_source', inv.wallet_source,
                             'wallet_debit_breakdown', v_breakdown,
                             'amount', inv.amount, 'net', v_net));
  RETURN inv;
END;
$function$;

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

  IF w.partner_id IS NOT NULL THEN
    SELECT COALESCE(available_balance, 0) INTO v_available
    FROM public.partner_wallets
    WHERE partner_id = w.partner_id;
    IF v_available < w.amount THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do parceiro';
    END IF;
    UPDATE public.partner_wallets
    SET available_balance = GREATEST(0, round((COALESCE(available_balance, 0) - w.amount)::numeric, 2)),
        total_withdrawn   = round((COALESCE(total_withdrawn, 0) + w.amount)::numeric, 2),
        updated_at        = now()
    WHERE partner_id = w.partner_id;
  ELSIF w.professional_coach_id IS NOT NULL THEN
    SELECT COALESCE(available_balance, 0) INTO v_available
    FROM public.professional_wallets
    WHERE professional_coach_id = w.professional_coach_id;
    IF v_available < w.amount THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do profissional';
    END IF;
    UPDATE public.professional_wallets
    SET available_balance = GREATEST(0, round((COALESCE(available_balance, 0) - w.amount)::numeric, 2)),
        total_withdrawn   = round((COALESCE(total_withdrawn, 0) + w.amount)::numeric, 2),
        updated_at        = now()
    WHERE professional_coach_id = w.professional_coach_id;
  ELSE
    SELECT
      COALESCE(wal.available_balance, 0)
      + COALESCE(pw.available_balance, 0)
      + COALESCE(profw.available_balance, 0)
    INTO v_available
    FROM (SELECT w.profile_id AS profile_id) src
    LEFT JOIN public.wallets wal ON wal.profile_id = src.profile_id
    LEFT JOIN public.partners p ON p.profile_id = src.profile_id
    LEFT JOIN public.partner_wallets pw ON pw.partner_id = p.id
    LEFT JOIN public.coaches c ON c.profile_id = src.profile_id
    LEFT JOIN public.professional_wallets profw ON profw.professional_coach_id = c.id;

    IF round(COALESCE(v_available, 0)::numeric, 2) + 0.001 < round(w.amount::numeric, 2) THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente (R$ %)', to_char(COALESCE(v_available, 0), 'FM999999990.00');
    END IF;
  END IF;

  UPDATE public.withdrawal_requests
  SET status      = 'paid',
      notes       = COALESCE(_notes, notes),
      approved_at = COALESCE(approved_at, now()),
      paid_at     = now(),
      approved_by = admin_profile_id
  WHERE id = _withdrawal_id;

  PERFORM public.recalc_wallets_for_owner(w.profile_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_on_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
  v_coach_id uuid;
  v_profile_id uuid;
BEGIN
  v_partner_id := COALESCE(NEW.partner_id, OLD.partner_id);
  v_coach_id := COALESCE(NEW.professional_coach_id, OLD.professional_coach_id);
  v_profile_id := COALESCE(NEW.profile_id, OLD.profile_id);

  IF v_partner_id IS NOT NULL THEN
    PERFORM public.recalc_partner_wallet(v_partner_id);
  END IF;
  IF v_coach_id IS NOT NULL THEN
    PERFORM public.recalc_professional_wallet(v_coach_id);
  END IF;
  IF v_profile_id IS NOT NULL THEN
    PERFORM public.recalc_wallets_for_owner(v_profile_id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalc_buyer_wallet_on_wallet_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_new_method text;
  v_old_method text;
BEGIN
  v_new_method := CASE WHEN TG_OP <> 'DELETE' THEN COALESCE(NEW.payment_method::text, '') ELSE '' END;
  v_old_method := CASE WHEN TG_OP <> 'INSERT' THEN COALESCE(OLD.payment_method::text, '') ELSE '' END;

  IF TG_OP <> 'DELETE' AND NEW.student_id IS NOT NULL THEN
    SELECT profile_id INTO v_profile_id FROM public.students WHERE id = NEW.student_id;
    IF v_profile_id IS NOT NULL AND v_new_method = 'wallet' THEN
      PERFORM public.recalc_wallets_for_owner(v_profile_id);
    END IF;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.student_id IS NOT NULL THEN
    SELECT profile_id INTO v_profile_id FROM public.students WHERE id = OLD.student_id;
    IF v_profile_id IS NOT NULL AND (TG_OP = 'DELETE' OR v_old_method = 'wallet' OR (TG_OP = 'UPDATE' AND OLD.student_id IS DISTINCT FROM NEW.student_id)) THEN
      PERFORM public.recalc_wallets_for_owner(v_profile_id);
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_recalc_buyer_wallet_store_orders ON public.store_orders;
CREATE TRIGGER trg_recalc_buyer_wallet_store_orders
AFTER INSERT OR UPDATE OR DELETE ON public.store_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_buyer_wallet_on_wallet_order();

DROP TRIGGER IF EXISTS trg_recalc_buyer_wallet_partner_orders ON public.partner_product_orders;
CREATE TRIGGER trg_recalc_buyer_wallet_partner_orders
AFTER INSERT OR UPDATE OR DELETE ON public.partner_product_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_buyer_wallet_on_wallet_order();

CREATE OR REPLACE FUNCTION public.admin_reconcile_all_wallets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  FOR r IN
    SELECT DISTINCT pid
    FROM (
      SELECT id AS pid FROM public.profiles
      UNION SELECT beneficiary_profile_id AS pid FROM public.commissions WHERE beneficiary_profile_id IS NOT NULL
      UNION SELECT profile_id AS pid FROM public.withdrawal_requests WHERE profile_id IS NOT NULL
      UNION SELECT p.profile_id AS pid FROM public.partners p JOIN public.partner_wallets w ON w.partner_id = p.id
      UNION SELECT c.profile_id AS pid FROM public.coaches c JOIN public.professional_wallets w ON w.professional_coach_id = c.id
      UNION SELECT s.profile_id AS pid FROM public.store_orders so JOIN public.students s ON s.id = so.student_id WHERE so.payment_method::text = 'wallet'
      UNION SELECT s.profile_id AS pid FROM public.partner_product_orders po JOIN public.students s ON s.id = po.student_id WHERE po.payment_method = 'wallet'
      UNION SELECT p.id AS pid FROM public.subscription_invoices si JOIN public.profiles p ON p.user_id = si.user_id WHERE si.payment_method = 'wallet'
    ) x
    WHERE pid IS NOT NULL
  LOOP
    PERFORM public.recalc_wallets_for_owner(r.pid);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;