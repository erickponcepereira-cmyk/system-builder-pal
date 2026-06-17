
-- 1) Coluna de política de resgate por parceiro
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS free_redeem_policy text NOT NULL DEFAULT 'all';

ALTER TABLE public.partners
  DROP CONSTRAINT IF EXISTS partners_free_redeem_policy_check;
ALTER TABLE public.partners
  ADD CONSTRAINT partners_free_redeem_policy_check
  CHECK (free_redeem_policy IN ('all','one_per_month'));

-- 2) Atualiza RPC para enforçar a política
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

-- 3) Trigger: ao usar um cupom em parceiro 'one_per_month', cancela outros ativos do mesmo aluno/parceiro no mês
CREATE OR REPLACE FUNCTION public.partner_coupon_enforce_one_per_month()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy text;
BEGIN
  IF NEW.status = 'used' AND (OLD.status IS DISTINCT FROM 'used') THEN
    SELECT free_redeem_policy INTO v_policy
    FROM public.partners WHERE id = NEW.partner_id;

    IF v_policy = 'one_per_month' THEN
      UPDATE public.partner_coupons
        SET status = 'cancelled'
      WHERE student_id = NEW.student_id
        AND partner_id = NEW.partner_id
        AND id <> NEW.id
        AND status = 'active'
        AND created_at >= date_trunc('month', now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partner_coupon_one_per_month ON public.partner_coupons;
CREATE TRIGGER trg_partner_coupon_one_per_month
AFTER UPDATE ON public.partner_coupons
FOR EACH ROW EXECUTE FUNCTION public.partner_coupon_enforce_one_per_month();
