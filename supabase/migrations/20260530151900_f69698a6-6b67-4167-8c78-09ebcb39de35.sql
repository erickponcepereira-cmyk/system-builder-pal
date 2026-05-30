CREATE OR REPLACE FUNCTION public.pay_coach_available(_profile_id UUID, _kind TEXT DEFAULT 'coach', _notes TEXT DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID;
  v_amount NUMERIC := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE user_id = auth.uid();

  IF _kind = 'network' THEN
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(is_referral,false) = false
      AND COALESCE(level,0) > 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

    IF v_amount <= 0 THEN RETURN 0; END IF;

    UPDATE public.commissions
    SET status = 'withdrawn'
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(is_referral,false) = false
      AND COALESCE(level,0) > 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

    UPDATE public.wallets
    SET available_balance = GREATEST(0, COALESCE(available_balance,0) - v_amount),
        total_withdrawn = COALESCE(total_withdrawn,0) + v_amount,
        updated_at = NOW()
    WHERE profile_id = _profile_id;

  ELSIF _kind = 'system' THEN
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(is_referral,false) = false
      AND (
        COALESCE(slot_label,'') ~* '^(sistema|admin)'
        OR (beneficiary_coach_id IS NULL AND COALESCE(slot_label,'') = '')
      );

    IF v_amount <= 0 THEN RETURN 0; END IF;

    UPDATE public.commissions
    SET status = 'withdrawn'
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(is_referral,false) = false
      AND (
        COALESCE(slot_label,'') ~* '^(sistema|admin)'
        OR (beneficiary_coach_id IS NULL AND COALESCE(slot_label,'') = '')
      );

  ELSIF _kind = 'student_referral' THEN
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(is_referral,false) = true;

    IF v_amount <= 0 THEN RETURN 0; END IF;

    UPDATE public.commissions
    SET status = 'withdrawn'
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(is_referral,false) = true;

    UPDATE public.wallets
    SET available_balance = GREATEST(0, COALESCE(available_balance,0) - v_amount),
        total_withdrawn = COALESCE(total_withdrawn,0) + v_amount,
        updated_at = NOW()
    WHERE profile_id = _profile_id;

  ELSE
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(is_referral,false) = false
      AND COALESCE(level,0) = 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

    IF v_amount <= 0 THEN RETURN 0; END IF;

    UPDATE public.commissions
    SET status = 'withdrawn'
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(is_referral,false) = false
      AND COALESCE(level,0) = 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

    UPDATE public.wallets
    SET available_balance = GREATEST(0, COALESCE(available_balance,0) - v_amount),
        total_withdrawn = COALESCE(total_withdrawn,0) + v_amount,
        updated_at = NOW()
    WHERE profile_id = _profile_id;
  END IF;

  INSERT INTO public.withdrawal_requests (profile_id, amount, status, requested_at, approved_at, paid_at, approved_by, notes)
  VALUES (_profile_id, v_amount, 'paid', NOW(), NOW(), NOW(), v_admin,
          COALESCE(_notes,
            CASE
              WHEN _kind='network' THEN 'Baixa rede via painel financeiro'
              WHEN _kind='system' THEN 'Baixa sistema via painel financeiro'
              WHEN _kind='student_referral' THEN 'Baixa indicação aluno via painel financeiro'
              ELSE 'Baixa coach via painel financeiro'
            END));

  RETURN v_amount;
END;
$$;