DROP POLICY IF EXISTS "Admins manage professional products" ON public.professional_products;
CREATE POLICY "Admins manage professional products" ON public.professional_products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'::user_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.user_id = auth.uid() AND profiles.role = 'admin'::user_role));

DROP POLICY IF EXISTS "Professional manages own products" ON public.professional_products;
CREATE POLICY "Professional manages own products" ON public.professional_products
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = professional_products.coach_id AND p.user_id = auth.uid() AND c.is_professional = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = professional_products.coach_id AND p.user_id = auth.uid() AND c.is_professional = true));

DROP POLICY IF EXISTS "Upline coach views downline professional products" ON public.professional_products;
CREATE POLICY "Upline coach views downline professional products" ON public.professional_products
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coaches prof
    JOIN public.coaches upline ON upline.id = prof.upline_coach_id
    JOIN public.profiles upline_p ON upline_p.id = upline.profile_id
    WHERE prof.id = professional_products.coach_id AND prof.is_professional = true AND upline_p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Upline coach approves downline professional products" ON public.professional_products;
CREATE POLICY "Upline coach approves downline professional products" ON public.professional_products
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coaches prof
    JOIN public.coaches upline ON upline.id = prof.upline_coach_id
    JOIN public.profiles upline_p ON upline_p.id = upline.profile_id
    WHERE prof.id = professional_products.coach_id AND prof.is_professional = true AND upline_p.user_id = auth.uid()));

DROP POLICY IF EXISTS "Public reads active approved professional products" ON public.professional_products;
CREATE POLICY "Public reads active approved professional products" ON public.professional_products
  FOR SELECT TO anon, authenticated
  USING (status = 'approved' AND is_active_by_professional = true);