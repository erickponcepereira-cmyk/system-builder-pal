CREATE OR REPLACE FUNCTION public.saldo_disponivel(_profile_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- A UNICA definicao de "quanto essa pessoa tem para sacar".
  -- Soma as carteiras de dinheiro (coach + parceiro + profissional),
  -- desconta adiantamento em aberto, e NAO inclui fitcoin de indicacao,
  -- que nao e sacavel em dinheiro.
  SELECT GREATEST(
    public.wallet_base_available(_profile_id)
    - COALESCE((SELECT SUM(GREATEST(a.amount - a.settled_amount, 0))
                  FROM public.wallet_advances a
                 WHERE a.profile_id = _profile_id), 0)
  , 0)::numeric;
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
  v_reserved_self numeric := 0;
  v_open_advance numeric := 0;
  v_base numeric := 0;
BEGIN
  IF NOT public.is_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles WHERE user_id = _admin_user_id;

  SELECT * INTO w FROM public.withdrawal_requests WHERE id = _withdrawal_id FOR UPDATE;

  IF w.id IS NULL THEN
    RAISE EXCEPTION 'Saque nao encontrado';
  END IF;

  IF w.status NOT IN ('approved', 'processing', 'requested') THEN
    RAISE EXCEPTION 'Apenas saques aprovados podem ser marcados como pagos';
  END IF;

  -- >>> MUDANCA: usa a definicao unica de saldo. Sai o fitcoin do aluno,
  --     que nao e sacavel em dinheiro, e entra o desconto de adiantamento.
  v_available := public.saldo_disponivel(w.profile_id);
  v_reserved_self := round(COALESCE(w.amount, 0)::numeric, 2);

  IF round(COALESCE(v_available, 0)::numeric, 2) + v_reserved_self + 0.001
     < round(w.amount::numeric, 2) THEN
    RAISE EXCEPTION 'Saldo disponivel insuficiente (disponivel R$ %, reservado para este saque R$ %)',
      to_char(COALESCE(v_available, 0), 'FM999999990.00'),
      to_char(v_reserved_self, 'FM999999990.00');
  END IF;
  -- <<< fim da mudanca

  UPDATE public.withdrawal_requests
  SET status      = 'paid',
      notes       = COALESCE(_notes, notes),
      approved_at = COALESCE(approved_at, now()),
      paid_at     = now(),
      approved_by = admin_profile_id
  WHERE id = _withdrawal_id;

  PERFORM public.recalc_wallets_for_owner(w.profile_id);

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

CREATE OR REPLACE FUNCTION public.pay_coach_available(_profile_id uuid, _kind text DEFAULT 'coach'::text, _notes text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin UUID;
  v_amount NUMERIC := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE user_id = auth.uid();

  -- >>> MUDANCA: os blocos abaixo NAO subtraem mais o saldo direto.
  --     Antes, esta funcao descontava available_balance E criava um saque
  --     pago. Como recalc_wallets_for_owner ja desconta saque pago, o valor
  --     saia DUAS VEZES ate o proximo recalculo. Agora ela so marca as
  --     comissoes e registra o saque; o saldo e recalculado no fim.
  IF _kind = 'network' THEN
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id AND status = 'available'
      AND COALESCE(is_referral,false) = false AND COALESCE(level,0) > 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';
    IF v_amount <= 0 THEN RETURN 0; END IF;
    UPDATE public.commissions SET status = 'withdrawn'
    WHERE beneficiary_profile_id = _profile_id AND status = 'available'
      AND COALESCE(is_referral,false) = false AND COALESCE(level,0) > 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

  ELSIF _kind = 'system' THEN
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id AND status = 'available'
      AND COALESCE(is_referral,false) = false
      AND (COALESCE(slot_label,'') ~* '^(sistema|admin)'
        OR (beneficiary_coach_id IS NULL AND COALESCE(slot_label,'') = ''));
    IF v_amount <= 0 THEN RETURN 0; END IF;
    UPDATE public.commissions SET status = 'withdrawn'
    WHERE beneficiary_profile_id = _profile_id AND status = 'available'
      AND COALESCE(is_referral,false) = false
      AND (COALESCE(slot_label,'') ~* '^(sistema|admin)'
        OR (beneficiary_coach_id IS NULL AND COALESCE(slot_label,'') = ''));

  ELSIF _kind = 'student_referral' THEN
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id AND status = 'available'
      AND COALESCE(is_referral,false) = true;
    IF v_amount <= 0 THEN RETURN 0; END IF;
    UPDATE public.commissions SET status = 'withdrawn'
    WHERE beneficiary_profile_id = _profile_id AND status = 'available'
      AND COALESCE(is_referral,false) = true;

  ELSE
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id AND status = 'available'
      AND COALESCE(is_referral,false) = false AND COALESCE(level,0) = 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';
    IF v_amount <= 0 THEN RETURN 0; END IF;
    UPDATE public.commissions SET status = 'withdrawn'
    WHERE beneficiary_profile_id = _profile_id AND status = 'available'
      AND COALESCE(is_referral,false) = false AND COALESCE(level,0) = 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';
  END IF;
  -- <<< fim da mudanca

  INSERT INTO public.withdrawal_requests (profile_id, amount, status, requested_at, approved_at, paid_at, approved_by, notes)
  VALUES (_profile_id, v_amount, 'paid', NOW(), NOW(), NOW(), v_admin,
          COALESCE(_notes,
            CASE WHEN _kind='network' THEN 'Baixa rede via painel financeiro'
                 WHEN _kind='system' THEN 'Baixa sistema via painel financeiro'
                 WHEN _kind='student_referral' THEN 'Baixa indicacao aluno via painel financeiro'
                 ELSE 'Baixa coach via painel financeiro' END));

  PERFORM public.recalc_wallets_for_owner(_profile_id);
  RETURN v_amount;
END;
$function$;

REVOKE ALL ON FUNCTION public.saldo_disponivel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.saldo_disponivel(uuid) TO authenticated, service_role;