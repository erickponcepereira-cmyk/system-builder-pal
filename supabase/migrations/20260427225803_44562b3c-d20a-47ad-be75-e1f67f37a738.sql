DROP POLICY IF EXISTS profiles_referrer_students_select ON public.profiles;
CREATE POLICY profiles_referrer_students_select
ON public.profiles
FOR SELECT
USING (
  id IN (
    SELECT referred.profile_id
    FROM public.students referred
    WHERE referred.referred_by_student_id IN (
      SELECT owner_student.id
      FROM public.students owner_student
      JOIN public.profiles owner_profile ON owner_profile.id = owner_student.profile_id
      WHERE owner_profile.user_id = auth.uid()
    )
  )
);