DROP POLICY IF EXISTS students_own_select ON public.students;
DROP POLICY IF EXISTS students_own_insert ON public.students;
DROP POLICY IF EXISTS students_own_update ON public.students;
DROP POLICY IF EXISTS students_coach_select ON public.students;
DROP POLICY IF EXISTS students_referrer_select ON public.students;
DROP POLICY IF EXISTS profiles_referrer_students_select ON public.profiles;

CREATE POLICY students_own_select
ON public.students
FOR SELECT
TO authenticated
USING (profile_id = public.current_profile_id());

CREATE POLICY students_own_insert
ON public.students
FOR INSERT
TO authenticated
WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY students_own_update
ON public.students
FOR UPDATE
TO authenticated
USING (profile_id = public.current_profile_id())
WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY students_coach_select
ON public.students
FOR SELECT
TO authenticated
USING (coach_id = public.current_coach_id());

CREATE POLICY students_referrer_select
ON public.students
FOR SELECT
TO authenticated
USING (
  referred_by_student_id IN (
    SELECT s.id FROM public.students s WHERE s.profile_id = public.current_profile_id()
  )
);

CREATE POLICY profiles_referrer_students_select
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT referred.profile_id
    FROM public.students referred
    WHERE referred.referred_by_student_id IN (
      SELECT owner_student.id
      FROM public.students owner_student
      WHERE owner_student.profile_id = public.current_profile_id()
    )
  )
);

REVOKE EXECUTE ON FUNCTION public.current_profile_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_coach_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_coach_id() TO authenticated;