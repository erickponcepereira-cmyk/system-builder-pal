
-- Backfill upline_coach_id for coaches who were students of erick before becoming coaches
UPDATE public.coaches c
SET upline_coach_id = s.coach_id
FROM public.students s
WHERE s.profile_id = c.profile_id
  AND s.coach_id IS NOT NULL
  AND (c.upline_coach_id IS NULL OR c.upline_coach_id = '75e5ab7a-2088-43fe-9510-a025ada25a30')
  AND s.coach_id <> c.id
  AND s.coach_id <> '75e5ab7a-2088-43fe-9510-a025ada25a30';

-- Trigger: when a coach row is inserted without an explicit upline, derive it from the student record
CREATE OR REPLACE FUNCTION public.set_coach_upline_from_student()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_coach uuid;
BEGIN
  IF NEW.upline_coach_id IS NULL OR NEW.upline_coach_id = '75e5ab7a-2088-43fe-9510-a025ada25a30' THEN
    SELECT coach_id INTO v_student_coach
    FROM public.students
    WHERE profile_id = NEW.profile_id
    LIMIT 1;
    IF v_student_coach IS NOT NULL AND v_student_coach <> NEW.id THEN
      NEW.upline_coach_id := v_student_coach;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_coach_upline_from_student ON public.coaches;
CREATE TRIGGER trg_set_coach_upline_from_student
BEFORE INSERT ON public.coaches
FOR EACH ROW
EXECUTE FUNCTION public.set_coach_upline_from_student();
