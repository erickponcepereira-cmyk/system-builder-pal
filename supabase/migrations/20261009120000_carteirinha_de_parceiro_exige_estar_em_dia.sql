-- A carteirinha da Claudia Vilma Bugs estava ativa sem ela ter comprado nada e
-- com a mensalidade bloqueada em setembro e outubro. O `card_valid_until` dela
-- e nulo - quem deixava a carteirinha de pe era o beneficio de parceiro:
--
--   student_has_partner_benefits(aluno) = existe unidade aprovada com produto
--   aprovado e ativo ligada a `students.partner_id`
--
-- e essa pergunta **nao olhava pagamento nenhum**. A tela da carteirinha diz
-- isso com todas as letras: "get the carteirinha always active, regardless of
-- subscription/card_valid_until". Como `students.partner_id` tambem aponta para
-- a propria unidade de quem e dono dela, todo parceiro virou portador de
-- carteirinha vitalicia, pagando ou nao.
--
-- Medido em 09/10/2026: 58 alunos com `partner_id`, 36 ganhando o beneficio,
-- **26 vivendo so dele** (sem card proprio valido) - destes **16 com fatura
-- bloqueada** e 14 sem compra nenhuma. Ja sairam 19 cupons de quem nao tinha
-- card proprio, 7 deles de inadimplente.
--
-- Duas correcoes:
--
-- 1. O beneficio passa a exigir estar em dia, pela mesma regra que o resto do
--    sistema usa (`is_user_blocked_by_subscription`, que olha fatura
--    `blocked`). Quem paga continua com a carteirinha; quem esta bloqueado
--    perde, e volta sozinho quando pagar. Tambem passa a ignorar produto
--    apagado (`deleted_at`), que antes ainda valia.
--
-- 2. **O resgate nao era verificado no servidor.** `requireCard()` existe so na
--    tela; as tres funcoes de resgate (cupom de parceiro, cupom de
--    profissional e brinde FitMind) nunca perguntaram pela carteirinha. Quem
--    chamasse a RPC direto resgatava sem carteirinha nenhuma. A regra que a
--    tela anuncia - "voce pode ver os beneficios, mas o resgate fica
--    bloqueado" - agora vale no banco, num lugar so: `student_card_ativa`.
--
-- Nao mexe em cupom ja emitido, e nao mexe em quem e dono de unidade e paga em
-- dia: se o beneficio deve valer para o dono ou so para colaborador e decisao
-- de negocio, nao defeito.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) A regra da carteirinha, num lugar so
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_has_partner_benefits(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.profiles pr ON pr.id = s.profile_id
    JOIN public.partners p ON p.id = s.partner_id
    JOIN public.partner_products pp ON pp.partner_id = p.id
    WHERE s.id = _student_id
      AND p.status = 'approved'
      AND pp.status = 'approved'
      AND pp.is_active_by_partner = true
      AND pp.deleted_at IS NULL
      AND NOT public.is_user_blocked_by_subscription(pr.user_id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.student_has_partner_benefits(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.student_card_ativa(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.students s
     WHERE s.id = _student_id
       AND s.card_valid_until IS NOT NULL
       AND s.card_valid_until > now()
  ) OR public.student_has_partner_benefits(_student_id);
$$;

COMMENT ON FUNCTION public.student_card_ativa(uuid) IS
  'A carteirinha esta ativa? Dia comprado em card_valid_until, ou beneficio de unidade parceira com a mensalidade em dia. E a regra que a tela de gratuidades anuncia, agora valendo no banco.';

GRANT EXECUTE ON FUNCTION public.student_card_ativa(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Cupom de parceiro: nao sai sem carteirinha
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_generate_partner_coupon(p_partner_product_id uuid)
 RETURNS TABLE(coupon_id uuid, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_student_id uuid;
  v_partner_id uuid;
  v_product_name text;
  v_discount_percent numeric;
  v_monthly_limit integer;
  v_policy text;
  v_existing_id uuid;
  v_existing_token text;
  v_used_this_month integer;
  v_other_partner_coupons integer;
  v_new_token text;
  v_new_id uuid;
BEGIN
  SELECT s.id INTO v_student_id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Student profile not found for current user';
  END IF;

  -- A tela ja segura isso em requireCard(); aqui e para valer.
  IF NOT public.student_card_ativa(v_student_id) THEN
    RAISE EXCEPTION 'Sua carteirinha esta inativa. O resgate de beneficios fica bloqueado ate ela voltar.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pp.partner_id, pp.name::text, pp.discount_percent, pp.monthly_redeem_limit, pa.free_redeem_policy
    INTO v_partner_id, v_product_name, v_discount_percent, v_monthly_limit, v_policy
  FROM public.partner_products pp
  JOIN public.partners pa ON pa.id = pp.partner_id
  WHERE pp.id = p_partner_product_id
    AND pp.kind = 'free'
    AND pp.status = 'approved'
    AND pp.is_active_by_partner = true
    AND pa.status = 'approved';

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Partner product not found';
  END IF;

  -- Cupom ativo existente: retorna o mesmo
  SELECT pc.id, pc.token::text INTO v_existing_id, v_existing_token
  FROM public.partner_coupons pc
  WHERE pc.student_id = v_student_id
    AND pc.partner_product_id = p_partner_product_id
    AND pc.status = 'active'
  LIMIT 1;

  IF v_existing_token IS NOT NULL THEN
    coupon_id := v_existing_id;
    token := v_existing_token;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Política "um por mês" por parceiro: bloqueia se já há cupom (ativo ou usado) de OUTRO produto do mesmo parceiro no mês
  IF v_policy = 'one_per_month' THEN
    SELECT COUNT(*) INTO v_other_partner_coupons
    FROM public.partner_coupons pc
    WHERE pc.student_id = v_student_id
      AND pc.partner_id = v_partner_id
      AND pc.partner_product_id <> p_partner_product_id
      AND pc.status IN ('active','used')
      AND pc.created_at >= date_trunc('month', now());

    IF v_other_partner_coupons > 0 THEN
      RAISE EXCEPTION 'Você já resgatou outro cupom desta empresa neste mês. Apenas 1 benefício gratuito por mês é permitido por esta empresa. Tente novamente no próximo mês.'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Limite mensal por produto
  IF v_monthly_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used_this_month
    FROM public.partner_coupons pc
    WHERE pc.student_id = v_student_id
      AND pc.partner_product_id = p_partner_product_id
      AND pc.status IN ('active','used')
      AND pc.created_at >= date_trunc('month', now());

    IF v_used_this_month >= v_monthly_limit THEN
      RAISE EXCEPTION 'Você já atingiu o limite mensal de % resgate(s) deste cupom. Tente novamente no próximo mês.', v_monthly_limit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_new_token := upper(encode(extensions.gen_random_bytes(12), 'hex'));

  INSERT INTO public.partner_coupons (
    partner_id, partner_product_id, student_id, token, status,
    discount_label, product_name
  )
  VALUES (
    v_partner_id, p_partner_product_id, v_student_id, v_new_token, 'active',
    CASE WHEN v_discount_percent IS NOT NULL THEN v_discount_percent::text || '% OFF' ELSE NULL END,
    v_product_name
  )
  RETURNING id INTO v_new_id;

  coupon_id := v_new_id;
  token := v_new_token;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Cupom de profissional: mesma trava
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_generate_professional_coupon(p_professional_product_id uuid)
 RETURNS TABLE(coupon_id uuid, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_student_id uuid;
  v_coach_id uuid;
  v_product_name text;
  v_discount_percent integer;
  v_monthly_limit integer;
  v_existing_id uuid;
  v_existing_token text;
  v_used_this_month integer;
  v_new_token text;
  v_new_id uuid;
BEGIN
  SELECT s.id INTO v_student_id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid() LIMIT 1;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado para o usuário atual';
  END IF;

  IF NOT public.student_card_ativa(v_student_id) THEN
    RAISE EXCEPTION 'Sua carteirinha esta inativa. O resgate de beneficios fica bloqueado ate ela voltar.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT pp.coach_id, pp.name, pp.discount_percent, pp.monthly_redeem_limit
    INTO v_coach_id, v_product_name, v_discount_percent, v_monthly_limit
  FROM public.professional_products pp
  WHERE pp.id = p_professional_product_id
    AND pp.kind = 'free'
    AND pp.status = 'approved'
    AND pp.is_active_by_professional = true;

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Benefício profissional não encontrado ou indisponível';
  END IF;

  SELECT pc.id, pc.token::text INTO v_existing_id, v_existing_token
  FROM public.professional_coupons pc
  WHERE pc.student_id = v_student_id
    AND pc.professional_product_id = p_professional_product_id
    AND pc.status = 'active' LIMIT 1;

  IF v_existing_token IS NOT NULL THEN
    coupon_id := v_existing_id; token := v_existing_token; RETURN NEXT; RETURN;
  END IF;

  IF v_monthly_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used_this_month FROM public.professional_coupons pc
    WHERE pc.student_id = v_student_id
      AND pc.professional_product_id = p_professional_product_id
      AND pc.status IN ('active','used','redeemed')
      AND pc.created_at >= date_trunc('month', now());
    IF v_used_this_month >= v_monthly_limit THEN
      RAISE EXCEPTION 'Limite mensal de % resgate(s) atingido. Tente novamente no próximo mês.', v_monthly_limit
        USING ERRCODE='P0001';
    END IF;
  END IF;

  v_new_token := upper(encode(extensions.gen_random_bytes(12), 'hex'));
  INSERT INTO public.professional_coupons(
    professional_coach_id, professional_product_id, student_id, token, status,
    discount_label, product_name
  ) VALUES (
    v_coach_id, p_professional_product_id, v_student_id, v_new_token, 'active',
    CASE WHEN v_discount_percent IS NOT NULL THEN v_discount_percent::text || '% OFF' ELSE NULL END,
    v_product_name
  ) RETURNING id INTO v_new_id;

  coupon_id := v_new_id; token := v_new_token; RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.student_generate_professional_coupon(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Brinde da propria FitMind: mesma trava
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_freebie(_freebie_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student_id uuid;
  v_count integer;
  v_freebie record;
  v_redemption_id uuid;
BEGIN
  SELECT s.id INTO v_student_id
  FROM students s JOIN profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;

  IF NOT public.student_card_ativa(v_student_id) THEN
    RAISE EXCEPTION 'Sua carteirinha esta inativa. O resgate de beneficios fica bloqueado ate ela voltar.'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_freebie FROM freebies WHERE id = _freebie_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brinde indisponível'; END IF;

  IF v_freebie.valid_from IS NOT NULL AND now() < v_freebie.valid_from THEN
    RAISE EXCEPTION 'Brinde ainda não disponível';
  END IF;
  IF v_freebie.valid_until IS NOT NULL AND now() > v_freebie.valid_until THEN
    RAISE EXCEPTION 'Brinde expirado';
  END IF;
  IF v_freebie.stock IS NOT NULL AND v_freebie.stock <= 0 THEN
    RAISE EXCEPTION 'Brinde esgotado';
  END IF;

  SELECT count(*) INTO v_count FROM freebie_redemptions
  WHERE freebie_id = _freebie_id AND student_id = v_student_id AND status <> 'cancelled';

  IF v_count >= v_freebie.per_student_limit THEN
    RAISE EXCEPTION 'Limite de resgate atingido';
  END IF;

  INSERT INTO freebie_redemptions (freebie_id, student_id, status)
  VALUES (_freebie_id, v_student_id, CASE WHEN v_freebie.kind = 'digital' THEN 'delivered' ELSE 'pending' END)
  RETURNING id INTO v_redemption_id;

  IF v_freebie.stock IS NOT NULL THEN
    UPDATE freebies SET stock = stock - 1 WHERE id = _freebie_id;
  END IF;

  RETURN v_redemption_id;
END;
$function$;

COMMIT;
