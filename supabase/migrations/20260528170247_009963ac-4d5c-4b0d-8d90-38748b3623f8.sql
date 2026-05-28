
ALTER TABLE public.partner_product_orders
  ADD COLUMN IF NOT EXISTS mp_payment_id UUID;

DROP POLICY IF EXISTS partner_orders_student_select ON public.partner_product_orders;
CREATE POLICY partner_orders_student_select ON public.partner_product_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.profiles p ON p.id = s.profile_id
      WHERE s.id = partner_product_orders.student_id AND p.user_id = auth.uid()
    )
  );
