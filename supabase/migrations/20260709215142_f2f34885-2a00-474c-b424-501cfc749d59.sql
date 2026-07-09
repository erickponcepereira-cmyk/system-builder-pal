
-- === Table ===
CREATE TABLE IF NOT EXISTS public.herbalife_boletos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.partner_product_orders(id) ON DELETE CASCADE,
  boleto_file_url text,
  boleto_barcode text,
  submitted_at timestamptz,
  submitted_by uuid REFERENCES auth.users(id),
  admin_paid_at timestamptz,
  admin_paid_by uuid REFERENCES auth.users(id),
  payment_proof_url text,
  status text NOT NULL DEFAULT 'pending_admin_payment' CHECK (status IN ('pending_admin_payment','paid')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);

CREATE INDEX IF NOT EXISTS idx_herbalife_boletos_order ON public.herbalife_boletos(order_id);
CREATE INDEX IF NOT EXISTS idx_herbalife_boletos_status ON public.herbalife_boletos(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.herbalife_boletos TO authenticated;
GRANT ALL ON public.herbalife_boletos TO service_role;

ALTER TABLE public.herbalife_boletos ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_all_boletos" ON public.herbalife_boletos
FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Parceiro/profissional vendedor pode ver e anexar boleto das suas vendas
CREATE POLICY "seller_view_boletos" ON public.herbalife_boletos
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.partner_product_orders o
    LEFT JOIN public.partners p ON p.id = o.partner_id
    LEFT JOIN public.coaches c ON c.id = o.professional_coach_id OR c.id = o.selling_coach_id
    LEFT JOIN public.profiles pr_p ON pr_p.id = p.profile_id
    LEFT JOIN public.profiles pr_c ON pr_c.id = c.profile_id
    WHERE o.id = herbalife_boletos.order_id
      AND (pr_p.user_id = auth.uid() OR pr_c.user_id = auth.uid())
  )
);

CREATE POLICY "seller_insert_boletos" ON public.herbalife_boletos
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.partner_product_orders o
    LEFT JOIN public.partners p ON p.id = o.partner_id
    LEFT JOIN public.coaches c ON c.id = o.professional_coach_id OR c.id = o.selling_coach_id
    LEFT JOIN public.profiles pr_p ON pr_p.id = p.profile_id
    LEFT JOIN public.profiles pr_c ON pr_c.id = c.profile_id
    WHERE o.id = herbalife_boletos.order_id
      AND (pr_p.user_id = auth.uid() OR pr_c.user_id = auth.uid())
  )
);

CREATE POLICY "seller_update_boletos" ON public.herbalife_boletos
FOR UPDATE TO authenticated
USING (
  status = 'pending_admin_payment' AND EXISTS (
    SELECT 1 FROM public.partner_product_orders o
    LEFT JOIN public.partners p ON p.id = o.partner_id
    LEFT JOIN public.coaches c ON c.id = o.professional_coach_id OR c.id = o.selling_coach_id
    LEFT JOIN public.profiles pr_p ON pr_p.id = p.profile_id
    LEFT JOIN public.profiles pr_c ON pr_c.id = c.profile_id
    WHERE o.id = herbalife_boletos.order_id
      AND (pr_p.user_id = auth.uid() OR pr_c.user_id = auth.uid())
  )
);

-- Trigger updated_at
CREATE TRIGGER trg_herbalife_boletos_updated
BEFORE UPDATE ON public.herbalife_boletos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === Storage policies for herbalife-boletos bucket ===
CREATE POLICY "herbalife_boletos_admin_all"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'herbalife-boletos' AND public.is_admin(auth.uid()))
WITH CHECK (bucket_id = 'herbalife-boletos' AND public.is_admin(auth.uid()));

CREATE POLICY "herbalife_boletos_auth_upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'herbalife-boletos');

CREATE POLICY "herbalife_boletos_auth_read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'herbalife-boletos');
