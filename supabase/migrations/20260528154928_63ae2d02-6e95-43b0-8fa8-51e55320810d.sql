
-- Permite que o coach da upline veja e atualize (aprovar/rejeitar) produtos
-- dos profissionais da sua downline direta.
CREATE POLICY "Upline coach views downline professional products"
ON public.professional_products
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches prof
    JOIN public.coaches upline ON upline.id = prof.upline_coach_id
    JOIN public.profiles upline_p ON upline_p.id = upline.profile_id
    WHERE prof.id = professional_products.coach_id
      AND prof.is_professional = true
      AND upline_p.user_id = auth.uid()
  )
);

CREATE POLICY "Upline coach approves downline professional products"
ON public.professional_products
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches prof
    JOIN public.coaches upline ON upline.id = prof.upline_coach_id
    JOIN public.profiles upline_p ON upline_p.id = upline.profile_id
    WHERE prof.id = professional_products.coach_id
      AND prof.is_professional = true
      AND upline_p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.coaches prof
    JOIN public.coaches upline ON upline.id = prof.upline_coach_id
    JOIN public.profiles upline_p ON upline_p.id = upline.profile_id
    WHERE prof.id = professional_products.coach_id
      AND prof.is_professional = true
      AND upline_p.user_id = auth.uid()
  )
);
