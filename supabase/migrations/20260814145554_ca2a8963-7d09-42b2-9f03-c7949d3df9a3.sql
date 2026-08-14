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