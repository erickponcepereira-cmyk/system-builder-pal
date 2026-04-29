CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_coach_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id
  FROM public.coaches c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

DROP POLICY IF EXISTS profiles_referrer_students_select ON public.profiles;
DROP POLICY IF EXISTS students_referrer_select ON public.students;
DROP POLICY IF EXISTS students_own_select ON public.students;
DROP POLICY IF EXISTS students_own_update ON public.students;
DROP POLICY IF EXISTS students_own_insert ON public.students;
DROP POLICY IF EXISTS students_coach_select ON public.students;

CREATE POLICY students_own_select
ON public.students
FOR SELECT
USING (profile_id = public.current_profile_id());

CREATE POLICY students_own_insert
ON public.students
FOR INSERT
WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY students_own_update
ON public.students
FOR UPDATE
USING (profile_id = public.current_profile_id())
WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY students_coach_select
ON public.students
FOR SELECT
USING (coach_id = public.current_coach_id());

CREATE POLICY students_referrer_select
ON public.students
FOR SELECT
USING (
  referred_by_student_id IN (
    SELECT s.id FROM public.students s WHERE s.profile_id = public.current_profile_id()
  )
);

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
      WHERE owner_student.profile_id = public.current_profile_id()
    )
  )
);

GRANT EXECUTE ON FUNCTION public.current_profile_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_coach_id() TO authenticated, anon;