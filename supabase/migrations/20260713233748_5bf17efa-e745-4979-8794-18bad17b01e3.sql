CREATE OR REPLACE FUNCTION public.guard_withdrawal_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _pid uuid;
  _student_id uuid;
  _res record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status AND NEW.amount = OLD.amount THEN
    RETURN NEW;
  END IF;

  IF NEW.amount IS NULL OR NEW.amount < 50 THEN
    RAISE EXCEPTION 'Saque mínimo: R$ 50,00' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME = 'student_withdrawal_requests' THEN
    _student_id := NEW.student_id;
    SELECT s.profile_id INTO _pid FROM public.students s WHERE s.id = NEW.student_id;
  ELSE
    _pid := NEW.profile_id;
    SELECT s.id INTO _student_id FROM public.students s WHERE s.profile_id = NEW.profile_id LIMIT 1;
  END IF;

  IF NEW.status IN ('requested','processing','approved') THEN
    IF _pid IS NULL THEN
      RAISE EXCEPTION 'Perfil não encontrado para solicitação de saque' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO _res FROM public.can_withdraw(_pid);
    IF NOT _res.allowed THEN
      RAISE EXCEPTION 'Saque bloqueado: %', _res.reason USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'withdrawal_requests' THEN
      IF EXISTS (
        SELECT 1 FROM public.withdrawal_requests wr
        WHERE wr.profile_id = _pid
          AND wr.status IN ('requested','processing','approved')
          AND wr.id <> NEW.id
      ) THEN
        RAISE EXCEPTION 'Já existe uma solicitação de saque pendente para este perfil. Cancele antes de refazer.' USING ERRCODE = 'unique_violation';
      END IF;
      IF _student_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.student_withdrawal_requests swr
        WHERE swr.student_id = _student_id
          AND swr.status IN ('requested','processing','approved')
      ) THEN
        RAISE EXCEPTION 'Já existe uma solicitação de saque pendente para este perfil. Cancele antes de refazer.' USING ERRCODE = 'unique_violation';
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.student_withdrawal_requests swr
        WHERE swr.student_id = _student_id
          AND swr.status IN ('requested','processing','approved')
          AND swr.id <> NEW.id
      ) THEN
        RAISE EXCEPTION 'Já existe uma solicitação de saque pendente para este perfil. Cancele antes de refazer.' USING ERRCODE = 'unique_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.withdrawal_requests wr
        WHERE wr.profile_id = _pid
          AND wr.status IN ('requested','processing','approved')
      ) THEN
        RAISE EXCEPTION 'Já existe uma solicitação de saque pendente para este perfil. Cancele antes de refazer.' USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_withdrawal_request ON public.withdrawal_requests;
CREATE TRIGGER trg_guard_withdrawal_request
BEFORE INSERT OR UPDATE ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_request();

DROP TRIGGER IF EXISTS trg_guard_student_withdrawal_request ON public.student_withdrawal_requests;
CREATE TRIGGER trg_guard_student_withdrawal_request
BEFORE INSERT OR UPDATE ON public.student_withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_request();

CREATE UNIQUE INDEX IF NOT EXISTS ux_withdrawal_requests_one_active_per_profile
ON public.withdrawal_requests(profile_id)
WHERE status IN ('requested','processing','approved');

CREATE UNIQUE INDEX IF NOT EXISTS ux_student_withdrawal_requests_one_active_per_student
ON public.student_withdrawal_requests(student_id)
WHERE status IN ('requested','processing','approved');

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

  IF w.status NOT IN ('approved', 'processing') THEN
    RAISE EXCEPTION 'Apenas saques aprovados podem ser marcados como pagos';
  END IF;

  IF w.partner_id IS NOT NULL THEN
    IF COALESCE((SELECT available_balance FROM public.partner_wallets WHERE partner_id = w.partner_id), 0) < w.amount THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do parceiro';
    END IF;
    UPDATE public.partner_wallets
    SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - w.amount),
        total_withdrawn = COALESCE(total_withdrawn, 0) + w.amount,
        updated_at = now()
    WHERE partner_id = w.partner_id;
  ELSIF w.professional_coach_id IS NOT NULL THEN
    IF COALESCE((SELECT available_balance FROM public.professional_wallets WHERE professional_coach_id = w.professional_coach_id), 0) < w.amount THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do profissional';
    END IF;
    UPDATE public.professional_wallets
    SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - w.amount),
        total_withdrawn = COALESCE(total_withdrawn, 0) + w.amount,
        updated_at = now()
    WHERE professional_coach_id = w.professional_coach_id;
  ELSE
    IF COALESCE((SELECT available_balance FROM public.wallets WHERE profile_id = w.profile_id), 0) < w.amount THEN
      RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do coach';
    END IF;
    UPDATE public.wallets
    SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - w.amount),
        total_withdrawn = COALESCE(total_withdrawn, 0) + w.amount,
        updated_at = now()
    WHERE profile_id = w.profile_id;
  END IF;

  UPDATE public.withdrawal_requests
  SET status = 'paid',
      notes = COALESCE(_notes, notes),
      approved_at = COALESCE(approved_at, now()),
      paid_at = now(),
      approved_by = admin_profile_id
  WHERE id = _withdrawal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_mark_student_withdrawal_paid(
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
  FROM public.student_withdrawal_requests
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF w.id IS NULL THEN
    RAISE EXCEPTION 'Saque não encontrado';
  END IF;

  IF w.status NOT IN ('approved', 'processing') THEN
    RAISE EXCEPTION 'Apenas saques aprovados podem ser marcados como pagos';
  END IF;

  IF COALESCE((SELECT available_balance FROM public.student_wallets WHERE student_id = w.student_id), 0) < w.amount THEN
    RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do aluno';
  END IF;

  UPDATE public.student_wallets
  SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - w.amount),
      total_withdrawn = COALESCE(total_withdrawn, 0) + w.amount,
      updated_at = now()
  WHERE student_id = w.student_id;

  UPDATE public.student_withdrawal_requests
  SET status = 'paid',
      notes = COALESCE(_notes, notes),
      approved_at = COALESCE(approved_at, now()),
      paid_at = now(),
      approved_by = admin_profile_id
  WHERE id = _withdrawal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_withdrawal_paid(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_mark_student_withdrawal_paid(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_mark_withdrawal_paid(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_student_withdrawal_paid(uuid, uuid, text) TO service_role;