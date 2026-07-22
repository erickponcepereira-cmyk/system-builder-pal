
-- 1) recalc_wallets_for_owner: incluir mensalidades pagas por carteira como "sacado"
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

  -- Subscription invoices paid via wallet (per wallet source)
  v_sub_main numeric := 0;
  v_sub_partner numeric := 0;
  v_sub_coach numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN; END IF;

  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = _profile_id;

  -- ---------- 1) MAIN wallet: commissions ----------
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

  -- Subscription invoices paid via wallet, per source
  IF v_user_id IS NOT NULL THEN
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE wallet_source = 'coach'), 0),
      COALESCE(SUM(amount) FILTER (WHERE wallet_source = 'partner'), 0),
      COALESCE(SUM(amount) FILTER (WHERE wallet_source = 'professional'), 0)
    INTO v_sub_main, v_sub_partner, v_sub_coach
    FROM public.subscription_invoices
    WHERE user_id = v_user_id
      AND status = 'paid'
      AND payment_method = 'wallet';
  END IF;

  -- ---------- 2) PARTNER wallet raw ----------
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

  -- ---------- 3) PROFESSIONAL wallet raw ----------
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

  -- ---------- 4a) Absorb subscription-invoice wallet debits per source ----------
  -- Main (wallet_source='coach'): cascades main -> partner -> coach (same as withdrawals)
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

  -- Partner subscription
  v_take := LEAST(v_partner_avail_raw, v_sub_partner);
  v_absorbed_partner_paid := v_absorbed_partner_paid + v_take;
  v_partner_avail_raw := v_partner_avail_raw - v_take;

  -- Professional subscription
  v_take := LEAST(v_coach_avail_raw, v_sub_coach);
  v_absorbed_coach_paid := v_absorbed_coach_paid + v_take;
  v_coach_avail_raw := v_coach_avail_raw - v_take;

  -- ---------- 4b) Cascade absorption for withdrawals ----------
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

  -- Reserved withdrawals
  v_leftover := v_reserved_seller;

  v_take := LEAST(v_available_main_raw, v_leftover);
  v_take_main_res := v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_partner_avail_raw, v_leftover);
  v_take_partner_res := v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_coach_avail_raw, v_leftover);
  v_take_coach_res := v_take;

  v_main_final    := GREATEST(0, v_available_main_raw - v_take_main_res);
  v_partner_final := GREATEST(0, v_partner_avail_raw   - v_take_partner_res);
  v_coach_final   := GREATEST(0, v_coach_avail_raw     - v_take_coach_res);

  -- ---------- 5) Persist wallets ----------
  INSERT INTO public.wallets (profile_id, pending_balance, available_balance, total_earned, total_withdrawn, updated_at)
  VALUES (_profile_id, v_pending, v_main_final, v_total_earned_main, v_absorbed_main_paid, now())
  ON CONFLICT (profile_id) DO UPDATE
  SET pending_balance=EXCLUDED.pending_balance,
      available_balance=EXCLUDED.available_balance,
      total_earned=EXCLUDED.total_earned,
      total_withdrawn=EXCLUDED.total_withdrawn,
      updated_at=now();

  IF v_partner_id IS NOT NULL THEN
    INSERT INTO public.partner_wallets (partner_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (v_partner_id, v_partner_final, v_partner_pending, v_partner_earned, v_absorbed_partner_paid, now())
    ON CONFLICT (partner_id) DO UPDATE
    SET available_balance=EXCLUDED.available_balance,
        pending_balance=EXCLUDED.pending_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END IF;

  IF v_coach_id IS NOT NULL THEN
    INSERT INTO public.professional_wallets (professional_coach_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (v_coach_id, v_coach_final, v_coach_pending, v_coach_earned, v_absorbed_coach_paid, now())
    ON CONFLICT (professional_coach_id) DO UPDATE
    SET available_balance=EXCLUDED.available_balance,
        pending_balance=EXCLUDED.pending_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END IF;
END;
$function$;

-- 2) process_subscription_invoice_payment: no longer mutates wallet directly; recalc drives the debit
CREATE OR REPLACE FUNCTION public.process_subscription_invoice_payment(
  _invoice_id uuid,
  _method invoice_payment_method,
  _wallet_source text DEFAULT NULL::text,
  _performed_by uuid DEFAULT NULL::uuid,
  _fee_amount numeric DEFAULT 0,
  _mp_payment_id text DEFAULT NULL::text
)
 RETURNS subscription_invoices
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
  v_partner_avail numeric;
  v_pro_avail numeric;
  v_coach_avail numeric;
BEGIN
  SELECT * INTO inv FROM public.subscription_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.status = 'paid' THEN RETURN inv; END IF;

  v_user := inv.user_id;
  v_remaining := inv.amount - COALESCE(_fee_amount, 0);
  v_tax := round((v_remaining * 0.06)::numeric, 2);
  v_net := round((v_remaining - v_tax)::numeric, 2);

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_user;

  -- Pré-validação: garante saldo suficiente na carteira selecionada (impede pagamento sem saldo)
  IF _method = 'wallet' THEN
    IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
    IF _wallet_source = 'coach' THEN
      SELECT available_balance INTO v_coach_avail FROM public.wallets WHERE profile_id = v_profile_id;
      IF COALESCE(v_coach_avail, 0) < inv.amount THEN
        RAISE EXCEPTION 'Saldo insuficiente na carteira do coach';
      END IF;
    ELSIF _wallet_source = 'partner' THEN
      SELECT pw.available_balance INTO v_partner_avail
        FROM public.partner_wallets pw
        JOIN public.partners p ON p.id = pw.partner_id
       WHERE p.profile_id = v_profile_id;
      IF COALESCE(v_partner_avail, 0) < inv.amount THEN
        RAISE EXCEPTION 'Saldo insuficiente na carteira do parceiro';
      END IF;
    ELSIF _wallet_source = 'professional' THEN
      SELECT pw.available_balance INTO v_pro_avail
        FROM public.professional_wallets pw
        JOIN public.coaches c ON c.id = pw.professional_coach_id
       WHERE c.profile_id = v_profile_id;
      IF COALESCE(v_pro_avail, 0) < inv.amount THEN
        RAISE EXCEPTION 'Saldo insuficiente na carteira do profissional';
      END IF;
    ELSE
      RAISE EXCEPTION 'wallet_source inválido';
    END IF;
  END IF;

  -- Credita admin
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
      payment_method = _method, wallet_source = _wallet_source,
      fee_amount = COALESCE(_fee_amount, 0), tax_amount = v_tax, net_to_admin = v_net,
      mp_payment_id = _mp_payment_id, updated_at = now()
  WHERE id = _invoice_id
  RETURNING * INTO inv;

  -- Recalcula carteira para refletir débito (fonte de verdade)
  IF _method = 'wallet' AND v_profile_id IS NOT NULL THEN
    PERFORM public.recalc_wallets_for_owner(v_profile_id);
  END IF;

  INSERT INTO public.subscription_payment_log(invoice_id, user_id, action, performed_by, details)
  VALUES (inv.id, v_user, 'paid', _performed_by,
          jsonb_build_object('method', _method, 'wallet_source', _wallet_source,
                             'amount', inv.amount, 'net', v_net));
  RETURN inv;
END;
$function$;

-- 3) Trigger: qualquer transição para 'paid' por carteira força recálculo
CREATE OR REPLACE FUNCTION public.subscription_invoice_recalc_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_profile_id uuid;
BEGIN
  IF NEW.status = 'paid' AND NEW.payment_method = 'wallet'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status
          OR OLD.payment_method IS DISTINCT FROM NEW.payment_method) THEN
    SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = NEW.user_id;
    IF v_profile_id IS NOT NULL THEN
      PERFORM public.recalc_wallets_for_owner(v_profile_id);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_subscription_invoice_recalc_wallet ON public.subscription_invoices;
CREATE TRIGGER trg_subscription_invoice_recalc_wallet
AFTER INSERT OR UPDATE OF status, payment_method ON public.subscription_invoices
FOR EACH ROW EXECUTE FUNCTION public.subscription_invoice_recalc_wallet();

-- 4) Backfill: recalcula todas as carteiras de usuários com mensalidade paga via carteira
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT p.id AS profile_id
    FROM public.subscription_invoices si
    JOIN public.profiles p ON p.user_id = si.user_id
    WHERE si.status = 'paid' AND si.payment_method = 'wallet'
  LOOP
    PERFORM public.recalc_wallets_for_owner(r.profile_id);
  END LOOP;
END $$;
