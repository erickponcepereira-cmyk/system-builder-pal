-- Pagar com saldo passa a enxergar todas as filiais do parceiro.
--
-- Um login de parceiro pode ter mais de uma unidade — são filiais, não
-- duplicata. Mas a cascata de débito fazia:
--
--   SELECT id INTO v_partner_id FROM public.partners WHERE profile_id = _profile_id LIMIT 1;
--
-- `LIMIT 1` sem `ORDER BY` escolhe uma filial arbitrária. Se o saldo está em
-- outra, a função recusa com "Saldo insuficiente" havendo dinheiro na conta —
-- e o dono não tem como saber por quê. Hoje 5 logins têm mais de uma unidade e
-- uma delas já tem saldo fora da primeira.
--
-- Agora o débito percorre as filiais em ordem de criação até cobrir o valor. O
-- `breakdown` continua com uma única chave `partner`, somando o que saiu de
-- todas — quem lê esse JSON não precisa mudar.
--
-- `coaches` segue com LIMIT 1 de propósito: nenhum perfil tem mais de um, e
-- `professional_wallets` é chaveada por coach.
CREATE OR REPLACE FUNCTION public.debit_user_wallets_cascade(
  _profile_id uuid,
  _amount numeric,
  _note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_remaining numeric := round(COALESCE(_amount, 0)::numeric, 2);
  v_bal numeric := 0;
  v_take numeric := 0;
  v_partner_id uuid;
  v_partner_total numeric := 0;
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
    FOR v_partner_id IN
      SELECT id FROM public.partners WHERE profile_id = _profile_id ORDER BY created_at
    LOOP
      EXIT WHEN v_remaining <= 0;

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
        v_partner_total := round((v_partner_total + v_take)::numeric, 2);
        v_remaining := round((v_remaining - v_take)::numeric, 2);
      END IF;
    END LOOP;

    IF v_partner_total > 0 THEN
      v_breakdown := v_breakdown || jsonb_build_object('partner', v_partner_total);
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
$fn$;
