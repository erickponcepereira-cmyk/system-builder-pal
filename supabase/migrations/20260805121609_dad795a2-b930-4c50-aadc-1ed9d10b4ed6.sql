DROP POLICY IF EXISTS "coprod credits creator read" ON public.product_coproduction_credits;
CREATE POLICY "coprod credits creator read"
  ON public.product_coproduction_credits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.product_coproductions pc
      WHERE pc.id = product_coproduction_credits.coproduction_id
        AND (
          (pc.creator_type = 'partner' AND EXISTS (
             SELECT 1 FROM public.partners p JOIN public.profiles pr ON pr.id = p.profile_id
             WHERE p.id = pc.creator_id AND pr.user_id = auth.uid()))
          OR (pc.creator_type <> 'partner' AND EXISTS (
             SELECT 1 FROM public.coaches c JOIN public.profiles pr ON pr.id = c.profile_id
             WHERE c.id = pc.creator_id AND pr.user_id = auth.uid()))
        )
    )
  );