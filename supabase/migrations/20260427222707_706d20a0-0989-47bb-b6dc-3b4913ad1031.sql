DROP POLICY IF EXISTS approved_coaches_public_select ON public.coaches;
CREATE POLICY approved_coaches_public_select ON public.coaches
FOR SELECT
USING (approved_at IS NOT NULL);

DROP POLICY IF EXISTS approved_coach_profiles_public_select ON public.profiles;
CREATE POLICY approved_coach_profiles_public_select ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.profile_id = profiles.id
      AND c.approved_at IS NOT NULL
  )
);

DROP POLICY IF EXISTS students_own_insert ON public.students;
CREATE POLICY students_own_insert ON public.students
FOR INSERT
WITH CHECK (
  profile_id IN (
    SELECT p.id FROM public.profiles p
    WHERE p.user_id = auth.uid()
  )
);