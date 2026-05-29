
-- 1) Link assessments to students and to challenge enrollment
ALTER TABLE public.coach_body_assessments
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS challenge_enrollment_id uuid REFERENCES public.competition_enrollments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS challenge_type text CHECK (challenge_type IN ('initial','final'));

CREATE INDEX IF NOT EXISTS idx_cba_student ON public.coach_body_assessments(student_id);
CREATE INDEX IF NOT EXISTS idx_cba_challenge ON public.coach_body_assessments(challenge_enrollment_id, challenge_type);

-- 2) Link coach_evaluation_clients to a student (optional)
ALTER TABLE public.coach_evaluation_clients
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cec_student ON public.coach_evaluation_clients(student_id);

-- 3) Allow students to read their OWN assessments
DROP POLICY IF EXISTS "Students can view own body assessments" ON public.coach_body_assessments;
CREATE POLICY "Students can view own body assessments"
  ON public.coach_body_assessments
  FOR SELECT
  TO authenticated
  USING (
    student_id IS NOT NULL AND student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.profiles p ON p.id = s.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

-- 4) Trigger: when assessment is saved with challenge link, auto-create share + push values into enrollment
CREATE OR REPLACE FUNCTION public.sync_challenge_assessment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_share_url text;
  v_client_name text;
BEGIN
  IF NEW.challenge_enrollment_id IS NULL OR NEW.challenge_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Find/create assessment_shares row
  SELECT token INTO v_token
    FROM public.assessment_shares
   WHERE assessment_id = NEW.id AND coach_id = NEW.coach_id
   LIMIT 1;

  IF v_token IS NULL THEN
    SELECT COALESCE(name, 'Aluno') INTO v_client_name
      FROM public.coach_evaluation_clients WHERE id = NEW.client_id;
    INSERT INTO public.assessment_shares (assessment_id, coach_id, client_name)
      VALUES (NEW.id, NEW.coach_id, COALESCE(v_client_name,'Aluno'))
      RETURNING token INTO v_token;
  END IF;

  v_share_url := '/resultado/' || v_token;

  IF NEW.challenge_type = 'initial' THEN
    UPDATE public.competition_enrollments
       SET initial_weight = COALESCE(NEW.weight, initial_weight),
           initial_body_fat = COALESCE(NEW.body_fat, initial_body_fat),
           initial_muscle_mass = COALESCE(NEW.muscle_mass, initial_muscle_mass),
           initial_share_url = v_share_url,
           status = CASE WHEN status IN ('enrolled','scheduled_initial') THEN 'weighed_initial' ELSE status END
     WHERE id = NEW.challenge_enrollment_id;
  ELSE
    UPDATE public.competition_enrollments
       SET final_weight = COALESCE(NEW.weight, final_weight),
           final_body_fat = COALESCE(NEW.body_fat, final_body_fat),
           final_muscle_mass = COALESCE(NEW.muscle_mass, final_muscle_mass),
           final_share_url = v_share_url,
           status = 'weighed_final'
     WHERE id = NEW.challenge_enrollment_id;
  END IF;

  -- Mark any related appointment as completed
  UPDATE public.competition_appointments
     SET status = 'completed', weight_recorded = NEW.weight, updated_at = now()
   WHERE enrollment_id = NEW.challenge_enrollment_id
     AND type = NEW.challenge_type
     AND status IN ('pending','confirmed');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_challenge_assessment ON public.coach_body_assessments;
CREATE TRIGGER trg_sync_challenge_assessment
  AFTER INSERT OR UPDATE OF challenge_enrollment_id, challenge_type, weight, body_fat, muscle_mass
  ON public.coach_body_assessments
  FOR EACH ROW EXECUTE FUNCTION public.sync_challenge_assessment();
