
-- ============================================================
-- Professional products: freebie/coupon + advanced scheduling
-- ============================================================

ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS redemption_mode text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS discount_percent integer,
  ADD COLUMN IF NOT EXISTS estimated_value numeric(12,2),
  ADD COLUMN IF NOT EXISTS benefit_start_time time without time zone,
  ADD COLUMN IF NOT EXISTS benefit_end_time time without time zone,
  ADD COLUMN IF NOT EXISTS monthly_redeem_limit integer,
  ADD COLUMN IF NOT EXISTS availability_weekdays smallint[] NOT NULL DEFAULT '{}'::smallint[],
  ADD COLUMN IF NOT EXISTS availability_recurrence text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS availability_validity_days integer,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Validation trigger (time-dependent rules belong in triggers, not CHECKs)
CREATE OR REPLACE FUNCTION public.professional_products_validate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind NOT IN ('paid','free') THEN
    RAISE EXCEPTION 'kind inválido: %', NEW.kind;
  END IF;
  IF NEW.redemption_mode NOT IN ('free','discount') THEN
    RAISE EXCEPTION 'redemption_mode inválido: %', NEW.redemption_mode;
  END IF;
  IF NEW.availability_recurrence NOT IN ('single','weekly') THEN
    RAISE EXCEPTION 'availability_recurrence inválido: %', NEW.availability_recurrence;
  END IF;
  IF NEW.discount_percent IS NOT NULL AND (NEW.discount_percent < 0 OR NEW.discount_percent > 100) THEN
    RAISE EXCEPTION 'discount_percent fora do intervalo 0-100';
  END IF;
  IF NEW.availability_weekdays IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM unnest(NEW.availability_weekdays) w WHERE w < 0 OR w > 6) THEN
      RAISE EXCEPTION 'availability_weekdays deve conter valores entre 0 e 6';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS professional_products_validate_tg ON public.professional_products;
CREATE TRIGGER professional_products_validate_tg
BEFORE INSERT OR UPDATE ON public.professional_products
FOR EACH ROW EXECUTE FUNCTION public.professional_products_validate();

-- ============================================================
-- Professional coupons (free benefit redemption with QR)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.professional_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token varchar NOT NULL UNIQUE,
  professional_coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  professional_product_id uuid NOT NULL REFERENCES public.professional_products(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status varchar NOT NULL DEFAULT 'active',
  discount_label text,
  product_name text,
  redeemed_at timestamptz,
  redeemed_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.professional_coupons TO authenticated;
GRANT ALL ON public.professional_coupons TO service_role;

ALTER TABLE public.professional_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view their professional coupons"
  ON public.professional_coupons FOR SELECT TO authenticated
  USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.profiles p ON p.id = s.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Professional views own coupons"
  ON public.professional_coupons FOR SELECT TO authenticated
  USING (
    professional_coach_id IN (
      SELECT c.id FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "Professional updates own coupons"
  ON public.professional_coupons FOR UPDATE TO authenticated
  USING (
    professional_coach_id IN (
      SELECT c.id FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_prof_coupons_student ON public.professional_coupons(student_id, status);
CREATE INDEX IF NOT EXISTS idx_prof_coupons_product ON public.professional_coupons(professional_product_id, created_at);

-- ============================================================
-- RPC: generate professional coupon
-- ============================================================
CREATE OR REPLACE FUNCTION public.student_generate_professional_coupon(p_professional_product_id uuid)
RETURNS TABLE(coupon_id uuid, token text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
$$;

GRANT EXECUTE ON FUNCTION public.student_generate_professional_coupon(uuid) TO authenticated;

-- Public-ish read of approved free professional products via existing SELECT policies on professional_products
-- (already governed by existing policies; no change needed here)
