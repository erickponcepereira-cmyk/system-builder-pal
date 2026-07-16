
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS professional_coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_professional_coach_id
  ON public.students(professional_coach_id)
  WHERE professional_coach_id IS NOT NULL;

-- Trigger: only allow professional coaches to be set as professional_coach_id
CREATE OR REPLACE FUNCTION public.validate_professional_coach_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.professional_coach_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.coaches
      WHERE id = NEW.professional_coach_id
        AND is_professional = true
    ) THEN
      RAISE EXCEPTION 'professional_coach_id must reference a coach with is_professional = true';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_professional_coach_id ON public.students;
CREATE TRIGGER trg_validate_professional_coach_id
  BEFORE INSERT OR UPDATE OF professional_coach_id ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.validate_professional_coach_id();

-- Allow the professional (owner of professional_coach_id) to read those student rows
CREATE POLICY "Professional can view own collaborators"
ON public.students
FOR SELECT
TO authenticated
USING (
  professional_coach_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = students.professional_coach_id
      AND p.user_id = auth.uid()
  )
);

-- Link function
CREATE OR REPLACE FUNCTION public.link_professional_collaborator(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_profile_id uuid;
  v_student_coach_id uuid;
  v_current_count int;
  v_max_collabs constant int := 7;
BEGIN
  SELECT p.id INTO v_profile_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.id INTO v_coach_id
  FROM public.coaches c
  WHERE c.profile_id = v_profile_id
    AND c.is_professional = true;

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Caller is not a professional';
  END IF;

  SELECT s.coach_id INTO v_student_coach_id
  FROM public.students s
  WHERE s.id = _student_id;

  IF v_student_coach_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF v_student_coach_id <> v_coach_id THEN
    RAISE EXCEPTION 'Student is not linked to this professional as coach';
  END IF;

  SELECT COUNT(*) INTO v_current_count
  FROM public.students
  WHERE professional_coach_id = v_coach_id;

  IF v_current_count >= v_max_collabs THEN
    RAISE EXCEPTION 'Collaborator limit reached (%)', v_max_collabs;
  END IF;

  UPDATE public.students
  SET professional_coach_id = v_coach_id
  WHERE id = _student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_professional_collaborator(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_profile_id uuid;
BEGIN
  SELECT p.id INTO v_profile_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT c.id INTO v_coach_id
  FROM public.coaches c
  WHERE c.profile_id = v_profile_id
    AND c.is_professional = true;

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Caller is not a professional';
  END IF;

  UPDATE public.students
  SET professional_coach_id = NULL
  WHERE id = _student_id
    AND professional_coach_id = v_coach_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_professional_collaborator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_professional_collaborator(uuid) TO authenticated;
