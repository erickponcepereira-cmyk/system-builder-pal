
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

  -- Disponível em TODAS as carteiras do titular (coach/geral, parceiro,
  -- profissional e aluno indicador). student_wallets entrava de fora antes.
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

  -- `recalc_wallets_for_owner` já subtrai do disponível os saques em aberto
  -- (requested/approved/processing). O valor DESTE pedido, portanto, já saiu
  -- da carteira e precisa ser somado de volta na conferência — senão ele é
  -- contado duas vezes e o pagamento trava mesmo havendo saldo.
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
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_mark_student_withdrawal_paid(_withdrawal_id uuid, _admin_user_id uuid, _notes text DEFAULT NULL::text)
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
  FROM public.student_withdrawal_requests
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF w.id IS NULL THEN
    RAISE EXCEPTION 'Saque não encontrado';
  END IF;

  IF w.status NOT IN ('approved', 'processing') THEN
    RAISE EXCEPTION 'Apenas saques aprovados podem ser marcados como pagos';
  END IF;

  SELECT COALESCE(available_balance, 0) INTO v_available
  FROM public.student_wallets WHERE student_id = w.student_id FOR UPDATE;

  -- Aceita também o caso em que o valor já foi reservado (subtraído do
  -- disponível) enquanto o pedido estava aprovado.
  IF round(COALESCE(v_available, 0)::numeric, 2) + round(w.amount::numeric, 2) + 0.001
     < round(w.amount::numeric, 2) THEN
    RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do aluno (R$ %)',
      to_char(COALESCE(v_available, 0), 'FM999999990.00');
  END IF;

  UPDATE public.student_wallets
  SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - LEAST(COALESCE(available_balance, 0), w.amount)),
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
$function$;

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

  -- Caminho "pago" delega para a função oficial, que confere o saldo
  -- considerando a reserva e recalcula as carteiras. Nada de débito manual
  -- aqui: isso duplicava a dedução feita por recalc_wallets_for_owner.
  IF _status = 'paid' THEN
    PERFORM public.admin_mark_withdrawal_paid(_withdrawal_id, auth.uid(), _notes);
    RETURN;
  END IF;

  UPDATE public.withdrawal_requests
  SET status = _status,
      notes = COALESCE(_notes, notes),
      approved_at = CASE WHEN _status IN ('approved', 'processing') AND approved_at IS NULL THEN now() ELSE approved_at END,
      approved_by = CASE WHEN _status IN ('approved', 'processing', 'rejected') THEN admin_profile_id ELSE approved_by END
  WHERE id = _withdrawal_id;

  PERFORM public.recalc_wallets_for_owner(w.profile_id);
END;
$function$;
