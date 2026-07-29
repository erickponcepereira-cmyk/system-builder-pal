DROP POLICY IF EXISTS "share codes owner manage" ON public.entity_share_codes;

CREATE POLICY "share codes owner manage"
ON public.entity_share_codes
FOR ALL
TO authenticated
USING (
  (owner_type = 'partner' AND EXISTS (
    SELECT 1 FROM public.partners p
    WHERE p.id = entity_share_codes.owner_id AND p.profile_id = public.current_profile_id()
  ))
  OR (owner_type = 'professional' AND EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = entity_share_codes.owner_id AND c.profile_id = public.current_profile_id()
  ))
)
WITH CHECK (
  (owner_type = 'partner' AND EXISTS (
    SELECT 1 FROM public.partners p
    WHERE p.id = entity_share_codes.owner_id AND p.profile_id = public.current_profile_id()
  ))
  OR (owner_type = 'professional' AND EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = entity_share_codes.owner_id AND c.profile_id = public.current_profile_id()
  ))
);