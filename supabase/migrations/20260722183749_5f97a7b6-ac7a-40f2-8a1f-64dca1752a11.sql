
DROP POLICY IF EXISTS "coprod insert creator" ON public.product_coproductions;
DROP POLICY IF EXISTS "coprod read" ON public.product_coproductions;
DROP POLICY IF EXISTS "coprod update either" ON public.product_coproductions;
DROP POLICY IF EXISTS "coprod delete creator" ON public.product_coproductions;

CREATE POLICY "coprod insert creator" ON public.product_coproductions
FOR INSERT TO authenticated
WITH CHECK (
  (creator_type = 'partner' AND EXISTS (
    SELECT 1 FROM public.partners pa
    JOIN public.profiles pr ON pr.id = pa.profile_id
    WHERE pa.id = product_coproductions.creator_id AND pr.user_id = auth.uid()
  ))
  OR (creator_type = 'professional' AND EXISTS (
    SELECT 1 FROM public.coaches c
    JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE c.id = product_coproductions.creator_id AND pr.user_id = auth.uid()
  ))
);

CREATE POLICY "coprod read" ON public.product_coproductions
FOR SELECT TO authenticated
USING (
  (creator_type = 'partner' AND EXISTS (
    SELECT 1 FROM public.partners pa JOIN public.profiles pr ON pr.id = pa.profile_id
    WHERE pa.id = product_coproductions.creator_id AND pr.user_id = auth.uid()
  ))
  OR (creator_type = 'professional' AND EXISTS (
    SELECT 1 FROM public.coaches c JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE c.id = product_coproductions.creator_id AND pr.user_id = auth.uid()
  ))
  OR (collaborator_type = 'partner' AND EXISTS (
    SELECT 1 FROM public.partners pa JOIN public.profiles pr ON pr.id = pa.profile_id
    WHERE pa.id = product_coproductions.collaborator_id AND pr.user_id = auth.uid()
  ))
  OR (collaborator_type = 'professional' AND EXISTS (
    SELECT 1 FROM public.coaches c JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE c.id = product_coproductions.collaborator_id AND pr.user_id = auth.uid()
  ))
);

CREATE POLICY "coprod update either" ON public.product_coproductions
FOR UPDATE TO authenticated
USING (
  (creator_type = 'partner' AND EXISTS (
    SELECT 1 FROM public.partners pa JOIN public.profiles pr ON pr.id = pa.profile_id
    WHERE pa.id = product_coproductions.creator_id AND pr.user_id = auth.uid()
  ))
  OR (creator_type = 'professional' AND EXISTS (
    SELECT 1 FROM public.coaches c JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE c.id = product_coproductions.creator_id AND pr.user_id = auth.uid()
  ))
  OR (collaborator_type = 'partner' AND EXISTS (
    SELECT 1 FROM public.partners pa JOIN public.profiles pr ON pr.id = pa.profile_id
    WHERE pa.id = product_coproductions.collaborator_id AND pr.user_id = auth.uid()
  ))
  OR (collaborator_type = 'professional' AND EXISTS (
    SELECT 1 FROM public.coaches c JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE c.id = product_coproductions.collaborator_id AND pr.user_id = auth.uid()
  ))
);

CREATE POLICY "coprod delete creator" ON public.product_coproductions
FOR DELETE TO authenticated
USING (
  (creator_type = 'partner' AND EXISTS (
    SELECT 1 FROM public.partners pa JOIN public.profiles pr ON pr.id = pa.profile_id
    WHERE pa.id = product_coproductions.creator_id AND pr.user_id = auth.uid()
  ))
  OR (creator_type = 'professional' AND EXISTS (
    SELECT 1 FROM public.coaches c JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE c.id = product_coproductions.creator_id AND pr.user_id = auth.uid()
  ))
);
