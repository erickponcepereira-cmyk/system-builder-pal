
-- =============================================================
-- 1) Recalc coach wallet: network pendente até bater a missao +
--    reserva do valor em saques ativos.
-- =============================================================
CREATE OR REPLACE FUNCTION public.recalc_wallet_for_profile(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total_earned numeric := 0;
  v_active_reserved numeric := 0;
  v_total_withdrawn numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN; END IF;

  WITH src AS (
    SELECT
      c.amount,
      c.status::text AS status,
      COALESCE(c.level, 0) AS level,
      c.created_at,
      COALESCE((
        SELECT nuh.any_completed
        FROM public.network_unlock_history nuh
        WHERE nuh.profile_id = _profile_id
          AND nuh.period_year  = EXTRACT(YEAR  FROM (c.created_at AT TIME ZONE 'UTC'))::int
          AND nuh.period_month = EXTRACT(MONTH FROM (c.created_at AT TIME ZONE 'UTC'))::int
      ), false) AS month_unlocked
    FROM public.commissions c
    WHERE c.beneficiary_profile_id = _profile_id
      AND COALESCE(c.is_referral, false) = false
      AND COALESCE(c.slot_label, '') !~* '^(sistema|admin|nutri)'
  )
  SELECT
    COALESCE(SUM(amount) FILTER (
      WHERE status = 'pending'
         OR (status = 'available' AND level > 0 AND NOT month_unlocked)
    ), 0),
    COALESCE(SUM(amount) FILTER (
      WHERE status = 'available' AND (level = 0 OR month_unlocked)
    ), 0),
    COALESCE(SUM(amount) FILTER (
      WHERE status IN ('pending','available','withdrawn')
    ), 0)
  INTO v_pending, v_available, v_total_earned
  FROM src;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_active_reserved
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND status IN ('requested','approved','processing');

  SELECT COALESCE(total_withdrawn, 0)
    INTO v_total_withdrawn
  FROM public.wallets
  WHERE profile_id = _profile_id;

  INSERT INTO public.wallets (profile_id, pending_balance, available_balance, total_earned, updated_at)
  VALUES (
    _profile_id,
    v_pending,
    GREATEST(0, v_available - v_active_reserved - v_total_withdrawn),
    v_total_earned,
    now()
  )
  ON CONFLICT (profile_id) DO UPDATE
  SET pending_balance   = EXCLUDED.pending_balance,
      available_balance = GREATEST(0, v_available - v_active_reserved - COALESCE(public.wallets.total_withdrawn, 0)),
      total_earned      = EXCLUDED.total_earned,
      updated_at        = now();
END;
$$;

-- =============================================================
-- 2) Trigger em withdrawal_requests para reservar/liberar saldo.
-- =============================================================
CREATE OR REPLACE FUNCTION public.withdrawal_requests_sync_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.profile_id IS NOT NULL AND OLD.partner_id IS NULL AND OLD.professional_coach_id IS NULL THEN
      PERFORM public.recalc_wallet_for_profile(OLD.profile_id);
    END IF;
    RETURN OLD;
  ELSE
    IF NEW.profile_id IS NOT NULL AND NEW.partner_id IS NULL AND NEW.professional_coach_id IS NULL THEN
      PERFORM public.recalc_wallet_for_profile(NEW.profile_id);
    END IF;
    IF TG_OP = 'UPDATE'
       AND OLD.profile_id IS DISTINCT FROM NEW.profile_id
       AND OLD.profile_id IS NOT NULL
       AND OLD.partner_id IS NULL
       AND OLD.professional_coach_id IS NULL THEN
      PERFORM public.recalc_wallet_for_profile(OLD.profile_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_withdrawal_requests_sync_wallet ON public.withdrawal_requests;
CREATE TRIGGER trg_withdrawal_requests_sync_wallet
AFTER INSERT OR UPDATE OR DELETE ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.withdrawal_requests_sync_wallet();

-- =============================================================
-- 3) Trigger em network_unlock_history: quando a missão bater, a
--    carteira do coach é recalculada e a rede vira disponível.
-- =============================================================
CREATE OR REPLACE FUNCTION public.network_unlock_sync_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.profile_id IS NOT NULL THEN PERFORM public.recalc_wallet_for_profile(OLD.profile_id); END IF;
    RETURN OLD;
  END IF;
  IF NEW.profile_id IS NOT NULL THEN PERFORM public.recalc_wallet_for_profile(NEW.profile_id); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_network_unlock_sync_wallet ON public.network_unlock_history;
CREATE TRIGGER trg_network_unlock_sync_wallet
AFTER INSERT OR UPDATE OR DELETE ON public.network_unlock_history
FOR EACH ROW EXECUTE FUNCTION public.network_unlock_sync_wallet();

-- =============================================================
-- 4) admin_mark_withdrawal_paid: não decrementa available direto
--    para o coach (a trigger de recalc cuida disso). Só ajusta o
--    total_withdrawn e o status. Partner/professional mantêm o
--    fluxo antigo (não usam recalc_wallet_for_profile).
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_mark_withdrawal_paid(
  _withdrawal_id uuid,
  _admin_user_id uuid,
  _notes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  w RECORD;
  admin_profile_id uuid;
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
    IF COALESCE((SELECT available_balance FROM public.partner_wallets WHERE partner_id = w.partner_id), 0) < w.amount THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do parceiro';
    END IF;
    UPDATE public.partner_wallets
    SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - w.amount),
        total_withdrawn   = COALESCE(total_withdrawn, 0) + w.amount,
        updated_at        = now()
    WHERE partner_id = w.partner_id;

  ELSIF w.professional_coach_id IS NOT NULL THEN
    IF COALESCE((SELECT available_balance FROM public.professional_wallets WHERE professional_coach_id = w.professional_coach_id), 0) < w.amount THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do profissional';
    END IF;
    UPDATE public.professional_wallets
    SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - w.amount),
        total_withdrawn   = COALESCE(total_withdrawn, 0) + w.amount,
        updated_at        = now()
    WHERE professional_coach_id = w.professional_coach_id;

  ELSE
    -- Coach: só atualiza total_withdrawn; a trigger recalc reajusta o available.
    INSERT INTO public.wallets (profile_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (w.profile_id, 0, 0, 0, w.amount, now())
    ON CONFLICT (profile_id) DO UPDATE
    SET total_withdrawn = COALESCE(public.wallets.total_withdrawn, 0) + w.amount,
        updated_at      = now();
  END IF;

  UPDATE public.withdrawal_requests
  SET status      = 'paid',
      notes       = COALESCE(_notes, notes),
      approved_at = COALESCE(approved_at, now()),
      paid_at     = now(),
      approved_by = admin_profile_id
  WHERE id = _withdrawal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_withdrawal_paid(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_withdrawal_paid(uuid, uuid, text) TO service_role;

-- =============================================================
-- 5) Recalcular carteira de todos os coaches para refletir as
--    novas regras imediatamente.
-- =============================================================
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT DISTINCT profile_id FROM public.wallets WHERE profile_id IS NOT NULL LOOP
    PERFORM public.recalc_wallet_for_profile(p.profile_id);
  END LOOP;
  FOR p IN SELECT DISTINCT beneficiary_profile_id AS profile_id FROM public.commissions WHERE beneficiary_profile_id IS NOT NULL LOOP
    PERFORM public.recalc_wallet_for_profile(p.profile_id);
  END LOOP;
END $$;
