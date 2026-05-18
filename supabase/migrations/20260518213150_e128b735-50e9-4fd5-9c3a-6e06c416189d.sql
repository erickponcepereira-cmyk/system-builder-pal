CREATE POLICY "Coaches can delete own body assessments"
ON public.coach_body_assessments
FOR DELETE
TO authenticated
USING (
  coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);