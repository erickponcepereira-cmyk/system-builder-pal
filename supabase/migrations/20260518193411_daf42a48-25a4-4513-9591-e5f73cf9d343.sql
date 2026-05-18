
-- Expand allowed coach commission percentages to 10/20/30/40/50 for partner products
ALTER TABLE public.partner_products
  DROP CONSTRAINT IF EXISTS partner_products_coach_commission_percentage_check;

ALTER TABLE public.partner_products
  ADD CONSTRAINT partner_products_coach_commission_percentage_check
    CHECK (coach_commission_percentage IN (10, 20, 30, 40, 50));

-- ============================================================
-- Professional products: same financial engine as partner products
-- ============================================================
CREATE TABLE IF NOT EXISTS public.professional_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  image_url text,
  price numeric(10,2) NOT NULL DEFAULT 0,
  stock integer,
  redemption_instructions text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','inactive')),
  admin_notes text,
  is_active_by_professional boolean NOT NULL DEFAULT true,
  price_input_mode text NOT NULL DEFAULT 'charge' CHECK (price_input_mode IN ('charge','receive')),
  coach_commission_percentage numeric(5,2) NOT NULL DEFAULT 10
    CHECK (coach_commission_percentage IN (10, 20, 30, 40, 50)),
  professional_net_amount numeric(10,2) DEFAULT 0,
  coach_commission_amount numeric(10,2) DEFAULT 0,
  network_l1_amount numeric(10,2) DEFAULT 0,
  network_l2_amount numeric(10,2) DEFAULT 0,
  network_l3_amount numeric(10,2) DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_professional_products_coach ON public.professional_products(coach_id);
CREATE INDEX IF NOT EXISTS idx_professional_products_status ON public.professional_products(status);

ALTER TABLE public.professional_products ENABLE ROW LEVEL SECURITY;

-- Professional owner can do everything on their own products
CREATE POLICY "Professional manages own products"
  ON public.professional_products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE c.id = professional_products.coach_id
        AND p.user_id = auth.uid()
        AND c.is_professional = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE c.id = professional_products.coach_id
        AND p.user_id = auth.uid()
        AND c.is_professional = true
    )
  );

-- Admins can do everything
CREATE POLICY "Admins manage professional products"
  ON public.professional_products FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
  );

-- Public read for approved+active products (for store listing)
CREATE POLICY "Public reads active approved professional products"
  ON public.professional_products FOR SELECT
  USING (status = 'approved' AND is_active_by_professional = true);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_professional_products_updated_at ON public.professional_products;
CREATE TRIGGER trg_professional_products_updated_at
  BEFORE UPDATE ON public.professional_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
