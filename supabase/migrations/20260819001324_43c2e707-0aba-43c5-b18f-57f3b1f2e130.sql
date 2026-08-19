CREATE OR REPLACE FUNCTION public.request_seller_withdrawal_atomic(
  _source text,
  _entity_id uuid,
  _amount numeric,
  _pix_key text,
  _pix_key_type text DEFAULT 'other',
  _notes text DEFAULT NULL
)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_partner_id uuid := NULL;
  v_professional_coach_id uuid := NULL;
  v_available numeric := 0;
  v_result public.withdrawal_requests%ROWTYPE;
  v_can record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;

  SELECT p.id INTO v_profile_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.merged_into_profile_id IS NULL;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  IF _amount IS NULL OR round(_amount, 2) < 50 THEN
    RAISE EXCEPTION 'Saque mínimo: R$ 50,00';
  END IF;

  IF NULLIF(btrim(COALESCE(_pix_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a chave PIX';
  END IF;

  IF _source NOT IN ('coach', 'partner', 'professional') THEN
    RAISE EXCEPTION 'Origem de saque inválida';
  END IF;

  -- Serializa qualquer solicitação do mesmo titular, inclusive entre abas.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_profile_id::text, 0));

  SELECT * INTO v_can FROM public.can_withdraw(v_profile_id);
  IF NOT COALESCE(v_can.allowed, false) THEN
    RAISE EXCEPTION 'Saque bloqueado: %', COALESCE(v_can.reason, 'indisponível');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.withdrawal_requests wr
    WHERE wr.profile_id = v_profile_id
      AND wr.status IN ('requested', 'approved', 'processing')
  ) OR EXISTS (
    SELECT 1
    FROM public.student_withdrawal_requests swr
    JOIN public.students s ON s.id = swr.student_id
    WHERE s.profile_id = v_profile_id
      AND swr.status IN ('requested', 'approved', 'processing')
  ) THEN
    RAISE EXCEPTION 'Você já tem uma solicitação pendente. Cancele antes de refazer.';
  END IF;

  IF _source = 'partner' THEN
    SELECT p.id INTO v_partner_id
    FROM public.partners p
    WHERE p.profile_id = v_profile_id
      AND (_entity_id IS NULL OR p.id = _entity_id)
    ORDER BY (p.status = 'approved') DESC, p.created_at ASC
    LIMIT 1;
    IF v_partner_id IS NULL THEN RAISE EXCEPTION 'Parceiro não encontrado para este perfil'; END IF;
  ELSIF _source = 'professional' THEN
    SELECT c.id INTO v_professional_coach_id
    FROM public.coaches c
    WHERE c.profile_id = v_profile_id
      AND (_entity_id IS NULL OR c.id = _entity_id)
    LIMIT 1;
    IF v_professional_coach_id IS NULL THEN RAISE EXCEPTION 'Profissional não encontrado para este perfil'; END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.coaches c
      WHERE c.profile_id = v_profile_id
        AND (_entity_id IS NULL OR c.id = _entity_id)
    ) THEN
      RAISE EXCEPTION 'Coach não encontrado para este perfil';
    END IF;
  END IF;

  -- Atualiza primeiro todas as carteiras com as mesmas regras usadas nos relatórios.
  PERFORM public.recalc_wallets_for_owner(v_profile_id);

  -- Trava as linhas financeiras até a criação e reserva do pedido terminarem.
  PERFORM 1 FROM public.wallets w WHERE w.profile_id = v_profile_id FOR UPDATE;
  PERFORM 1 FROM public.partner_wallets pw
    JOIN public.partners p ON p.id = pw.partner_id
    WHERE p.profile_id = v_profile_id FOR UPDATE OF pw;
  PERFORM 1 FROM public.professional_wallets profw
    JOIN public.coaches c ON c.id = profw.professional_coach_id
    WHERE c.profile_id = v_profile_id FOR UPDATE OF profw;
  PERFORM 1 FROM public.student_wallets sw
    JOIN public.students s ON s.id = sw.student_id
    WHERE s.profile_id = v_profile_id FOR UPDATE OF sw;

  SELECT
      COALESCE((SELECT w.available_balance FROM public.wallets w WHERE w.profile_id = v_profile_id), 0)
    + COALESCE((SELECT SUM(pw.available_balance) FROM public.partner_wallets pw JOIN public.partners p ON p.id = pw.partner_id WHERE p.profile_id = v_profile_id), 0)
    + COALESCE((SELECT SUM(profw.available_balance) FROM public.professional_wallets profw JOIN public.coaches c ON c.id = profw.professional_coach_id WHERE c.profile_id = v_profile_id), 0)
    + COALESCE((SELECT SUM(sw.available_balance) FROM public.student_wallets sw JOIN public.students s ON s.id = sw.student_id WHERE s.profile_id = v_profile_id), 0)
  INTO v_available;

  IF round(_amount, 2) > round(v_available, 2) THEN
    RAISE EXCEPTION 'Saldo disponível insuficiente (R$ %)', to_char(v_available, 'FM999999990.00');
  END IF;

  INSERT INTO public.withdrawal_requests (
    profile_id, partner_id, professional_coach_id, amount,
    pix_key, pix_key_type, status, notes
  ) VALUES (
    v_profile_id, v_partner_id, v_professional_coach_id, round(_amount, 2),
    btrim(_pix_key), COALESCE(NULLIF(btrim(_pix_key_type), ''), 'other'), 'requested', NULLIF(btrim(COALESCE(_notes, '')), '')
  )
  RETURNING * INTO v_result;

  -- O trigger também recalcula; esta chamada explícita mantém a operação correta
  -- mesmo se a configuração de triggers mudar no futuro.
  PERFORM public.recalc_wallets_for_owner(v_profile_id);

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_seller_withdrawal_atomic(text, uuid, numeric, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_seller_withdrawal_atomic(text, uuid, numeric, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.request_seller_withdrawal_atomic(text, uuid, numeric, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_seller_withdrawal_atomic(text, uuid, numeric, text, text, text) TO service_role;