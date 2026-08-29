CREATE OR REPLACE FUNCTION public.professional_can_view_student(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coach_evaluation_clients cec
    JOIN public.coaches c ON c.id = cec.coach_id
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE cec.student_id = _student_id
      AND p.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1
    FROM public.professional_appointments pa
    JOIN public.coaches c ON c.id = pa.professional_coach_id
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE pa.student_id = _student_id
      AND p.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.professional_can_view_student(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professional_can_view_student(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS anamnesis_professional_linked_select ON public.anamnesis_forms;
CREATE POLICY anamnesis_professional_linked_select
ON public.anamnesis_forms
FOR SELECT
TO authenticated
USING (public.professional_can_view_student(student_id));