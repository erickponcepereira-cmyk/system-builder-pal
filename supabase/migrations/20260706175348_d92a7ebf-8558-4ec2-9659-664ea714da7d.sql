
-- Master coach: read all challenge enrollments
DROP POLICY IF EXISTS enrollments_master_read ON public.competition_enrollments;
CREATE POLICY enrollments_master_read
ON public.competition_enrollments
FOR SELECT
TO authenticated
USING (public.is_master_coach(public.current_coach_id()));

-- Master coach: read all students
DROP POLICY IF EXISTS students_master_select ON public.students;
CREATE POLICY students_master_select
ON public.students
FOR SELECT
TO authenticated
USING (public.is_master_coach(public.current_coach_id()));
