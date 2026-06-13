CREATE OR REPLACE FUNCTION public.update_coach_withdrawal_status(_withdrawal_id uuid, _status withdrawal_status, _notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
  admin_profile_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles WHERE user_id = auth.uid();

  SELECT * INTO w FROM public.withdrawal_requests WHERE id = _withdrawal_id FOR UPDATE;
  IF w.id IS NULL THEN
    RAISE EXCEPTION 'Saque não encontrado';
  END IF;

  IF _status = 'paid' THEN
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
  END IF;

  UPDATE public.withdrawal_requests
  SET status = _status,
      notes = COALESCE(_notes, notes),
      approved_at = CASE WHEN _status IN ('approved', 'processing', 'paid') AND approved_at IS NULL THEN now() ELSE approved_at END,
      paid_at = CASE WHEN _status = 'paid' THEN now() ELSE paid_at END,
      approved_by = CASE WHEN _status IN ('approved', 'processing', 'paid', 'rejected') THEN admin_profile_id ELSE approved_by END
  WHERE id = _withdrawal_id;
END;
$function$;