CREATE OR REPLACE FUNCTION public.update_student_withdrawal_status(
  _withdrawal_id UUID,
  _status withdrawal_status,
  _notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  w RECORD;
  admin_profile_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles WHERE user_id = auth.uid();

  SELECT * INTO w
  FROM public.student_withdrawal_requests
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF w.id IS NULL THEN
    RAISE EXCEPTION 'Saque não encontrado';
  END IF;

  IF _status = 'paid' THEN
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
  END IF;

  UPDATE public.student_withdrawal_requests
  SET status = _status,
      notes = COALESCE(_notes, notes),
      approved_at = CASE WHEN _status IN ('approved', 'processing', 'paid') AND approved_at IS NULL THEN now() ELSE approved_at END,
      paid_at = CASE WHEN _status = 'paid' THEN now() ELSE paid_at END,
      approved_by = CASE WHEN _status IN ('approved', 'processing', 'paid', 'rejected') THEN admin_profile_id ELSE approved_by END
  WHERE id = _withdrawal_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_coach_withdrawal_status(
  _withdrawal_id UUID,
  _status withdrawal_status,
  _notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  w RECORD;
  admin_profile_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles WHERE user_id = auth.uid();

  SELECT * INTO w
  FROM public.withdrawal_requests
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF w.id IS NULL THEN
    RAISE EXCEPTION 'Saque não encontrado';
  END IF;

  IF _status = 'paid' THEN
    IF w.status NOT IN ('approved', 'processing') THEN
      RAISE EXCEPTION 'Apenas saques aprovados podem ser marcados como pagos';
    END IF;

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
  SET status = _status,
      notes = COALESCE(_notes, notes),
      approved_at = CASE WHEN _status IN ('approved', 'processing', 'paid') AND approved_at IS NULL THEN now() ELSE approved_at END,
      paid_at = CASE WHEN _status = 'paid' THEN now() ELSE paid_at END,
      approved_by = CASE WHEN _status IN ('approved', 'processing', 'paid', 'rejected') THEN admin_profile_id ELSE approved_by END
  WHERE id = _withdrawal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_student_withdrawal_status(UUID, withdrawal_status, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_coach_withdrawal_status(UUID, withdrawal_status, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_student_withdrawal_status(UUID, withdrawal_status, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_coach_withdrawal_status(UUID, withdrawal_status, TEXT) TO authenticated;

DROP POLICY IF EXISTS students_referrer_select ON public.students;
CREATE POLICY students_referrer_select
ON public.students
FOR SELECT
USING (
  referred_by_student_id IN (
    SELECT s.id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid()
  )
);