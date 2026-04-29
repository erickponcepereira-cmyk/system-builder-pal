CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1
$$;

DROP POLICY IF EXISTS students_referrer_select ON public.students;
DROP POLICY IF EXISTS profiles_referrer_students_select ON public.profiles;

CREATE POLICY students_referrer_select
ON public.students
FOR SELECT
TO authenticated
USING (referred_by_student_id = public.current_student_id());

CREATE POLICY profiles_referrer_students_select
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT referred.profile_id
    FROM public.students referred
    WHERE referred.referred_by_student_id = public.current_student_id()
  )
);

REVOKE EXECUTE ON FUNCTION public.current_student_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_student_id() TO authenticated;