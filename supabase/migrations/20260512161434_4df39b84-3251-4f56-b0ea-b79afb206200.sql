-- ============================================================
-- ENUM: destinos de valor
-- ============================================================
DO $$ BEGIN
  CREATE TYPE public.value_destination_type AS ENUM (
    'admin_wallet',
    'coach_wallet',
    'network_l1',
    'network_l2',
    'network_l3',
    'nutritionist_wallet',
    'health_pro_wallet',
    'product_order_pool',
    'referral_student',
    'master_coach_wallet',
    'event_organizer',
    'platform_reserve',
    'payment_gateway',
    'government_tax',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- payment_fee_configs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.payment_fee_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  card_fee_percentage NUMERIC(6,4) NOT NULL DEFAULT 4.98,
  card_fee_3x12_percentage NUMERIC(6,4) NOT NULL DEFAULT 4.98,
  pix_fee_percentage NUMERIC(6,4) NOT NULL DEFAULT 0.99,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from DATE,
  valid_until DATE,
  notes TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_fee_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fee_configs_admin_all" ON public.payment_fee_configs;
CREATE POLICY "fee_configs_admin_all" ON public.payment_fee_configs FOR ALL TO public
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "fee_configs_read_authenticated" ON public.payment_fee_configs;
CREATE POLICY "fee_configs_read_authenticated" ON public.payment_fee_configs FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_fee_configs_updated_at ON public.payment_fee_configs;
CREATE TRIGGER trg_fee_configs_updated_at BEFORE UPDATE ON public.payment_fee_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.payment_fee_configs (name, card_fee_percentage, card_fee_3x12_percentage, pix_fee_percentage, is_active, is_default)
SELECT 'Padrão FitMind', 4.98, 4.98, 0.99, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM public.payment_fee_configs WHERE is_default = TRUE);

-- ============================================================
-- product_value_slots
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_value_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  slot_order INTEGER NOT NULL DEFAULT 0,
  label VARCHAR(150) NOT NULL,
  description TEXT,
  value_type VARCHAR(10) NOT NULL DEFAULT 'percentage' CHECK (value_type IN ('percentage','fixed')),
  value_amount NUMERIC(12,4) NOT NULL DEFAULT 0,
  destination public.value_destination_type NOT NULL,
  destination_label VARCHAR(150),
  is_blocked_until_delivery BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_trigger VARCHAR(50),
  linked_profile_role VARCHAR(50),
  redirect_to_module VARCHAR(50),
  redirect_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  applies_to_referral_sales BOOLEAN NOT NULL DEFAULT TRUE,
  applies_to_student_referral BOOLEAN NOT NULL DEFAULT FALSE,
  is_system_fee BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_value_slots_product ON public.product_value_slots(product_id, slot_order);

ALTER TABLE public.product_value_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slots_admin_all" ON public.product_value_slots;
CREATE POLICY "slots_admin_all" ON public.product_value_slots FOR ALL TO public
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "slots_read_authenticated" ON public.product_value_slots;
CREATE POLICY "slots_read_authenticated" ON public.product_value_slots FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_value_slots_updated_at ON public.product_value_slots;
CREATE TRIGGER trg_value_slots_updated_at BEFORE UPDATE ON public.product_value_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- product_referral_rules
-- ============================================================
CREATE TABLE IF NOT EXISTS public.product_referral_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  pre_deduction_fixed NUMERIC(12,2) NOT NULL DEFAULT 20.00,
  pre_deduction_label VARCHAR(100) NOT NULL DEFAULT 'Taxa do Sistema',
  student_referral_percentage NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  coach_pool_percentage NUMERIC(5,2) NOT NULL DEFAULT 50.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_referral_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ref_rules_admin_all" ON public.product_referral_rules;
CREATE POLICY "ref_rules_admin_all" ON public.product_referral_rules FOR ALL TO public
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "ref_rules_read_authenticated" ON public.product_referral_rules;
CREATE POLICY "ref_rules_read_authenticated" ON public.product_referral_rules FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS trg_ref_rules_updated_at ON public.product_referral_rules;
CREATE TRIGGER trg_ref_rules_updated_at BEFORE UPDATE ON public.product_referral_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- products: novos campos de pontos
-- ============================================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS points_per_sale INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points_auto_calculated BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================
-- BACKFILL: criar slots iniciais para produtos existentes
-- a partir das colunas legadas (app_fee, commission_coach, commission_level1/2/3)
-- ============================================================
DO $$
DECLARE
  prod RECORD;
  next_order INT;
BEGIN
  FOR prod IN SELECT id, COALESCE(price,0) AS price, COALESCE(app_fee,0) AS app_fee,
                     COALESCE(commission_coach,0) AS cc,
                     COALESCE(commission_level1,0) AS l1,
                     COALESCE(commission_level2,0) AS l2,
                     COALESCE(commission_level3,0) AS l3
              FROM public.products LOOP
    IF EXISTS (SELECT 1 FROM public.product_value_slots WHERE product_id = prod.id) THEN
      CONTINUE;
    END IF;
    next_order := 0;

    IF prod.app_fee > 0 THEN
      INSERT INTO public.product_value_slots (product_id, slot_order, label, value_type, value_amount, destination, destination_label, is_system_fee, applies_to_referral_sales, applies_to_student_referral)
      VALUES (prod.id, next_order, 'Taxa do Sistema', 'fixed', prod.app_fee, 'admin_wallet', 'Carteiras dos Admins', TRUE, TRUE, TRUE);
      next_order := next_order + 1;
    END IF;

    IF prod.cc > 0 THEN
      INSERT INTO public.product_value_slots (product_id, slot_order, label, value_type, value_amount, destination, destination_label, applies_to_referral_sales, applies_to_student_referral)
      VALUES (prod.id, next_order, 'Comissão do Coach Vendedor', 'percentage', prod.cc, 'coach_wallet', 'Carteira do Coach', TRUE, TRUE);
      next_order := next_order + 1;
    END IF;

    IF prod.l1 > 0 THEN
      INSERT INTO public.product_value_slots (product_id, slot_order, label, value_type, value_amount, destination, destination_label, applies_to_referral_sales, applies_to_student_referral)
      VALUES (prod.id, next_order, 'Rede Linha 1', 'percentage', prod.l1, 'network_l1', 'Upline Linha 1', TRUE, TRUE);
      next_order := next_order + 1;
    END IF;
    IF prod.l2 > 0 THEN
      INSERT INTO public.product_value_slots (product_id, slot_order, label, value_type, value_amount, destination, destination_label, applies_to_referral_sales, applies_to_student_referral)
      VALUES (prod.id, next_order, 'Rede Linha 2', 'percentage', prod.l2, 'network_l2', 'Upline Linha 2', TRUE, TRUE);
      next_order := next_order + 1;
    END IF;
    IF prod.l3 > 0 THEN
      INSERT INTO public.product_value_slots (product_id, slot_order, label, value_type, value_amount, destination, destination_label, applies_to_referral_sales, applies_to_student_referral)
      VALUES (prod.id, next_order, 'Rede Linha 3', 'percentage', prod.l3, 'network_l3', 'Upline Linha 3', TRUE, TRUE);
    END IF;

    INSERT INTO public.product_referral_rules (product_id, enabled, pre_deduction_fixed, student_referral_percentage, coach_pool_percentage)
    VALUES (prod.id, TRUE, 20.00, 50.00, 50.00)
    ON CONFLICT (product_id) DO NOTHING;

    -- pontos automáticos a partir da taxa do sistema (FLOOR(fee/20)*10)
    UPDATE public.products
    SET points_per_sale = FLOOR(prod.app_fee / 20) * 10,
        points_auto_calculated = TRUE
    WHERE id = prod.id;
  END LOOP;
END $$;

-- ============================================================
-- Função utilitária: recalcular pontos automáticos quando slots mudam
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_product_points(_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fee_total NUMERIC := 0;
  product_price NUMERIC := 0;
  is_auto BOOLEAN := TRUE;
BEGIN
  SELECT points_auto_calculated, COALESCE(price, 0)
    INTO is_auto, product_price
  FROM public.products WHERE id = _product_id;

  IF NOT is_auto THEN RETURN; END IF;

  -- soma todos os slots marcados como is_system_fee
  SELECT COALESCE(SUM(
    CASE WHEN value_type = 'fixed' THEN value_amount
         ELSE product_price * (value_amount / 100.0)
    END
  ), 0)
  INTO fee_total
  FROM public.product_value_slots
  WHERE product_id = _product_id AND is_system_fee = TRUE AND is_active = TRUE;

  UPDATE public.products
  SET points_per_sale = FLOOR(fee_total / 20) * 10
  WHERE id = _product_id;
END;
$$;

-- Trigger para recalcular pontos quando slots mudam
CREATE OR REPLACE FUNCTION public.trg_recalc_points_from_slots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_product_points(COALESCE(NEW.product_id, OLD.product_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_slots_recalc_points ON public.product_value_slots;
CREATE TRIGGER trg_slots_recalc_points
  AFTER INSERT OR UPDATE OR DELETE ON public.product_value_slots
  FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_points_from_slots();