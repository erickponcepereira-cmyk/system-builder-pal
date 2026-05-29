CREATE OR REPLACE FUNCTION public.sync_challenge_assessment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_share_url text;
  v_client_name text;
  v_muscle numeric;
BEGIN
  IF NEW.challenge_enrollment_id IS NULL OR NEW.challenge_type IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT token INTO v_token
    FROM public.assessment_shares
    WHERE assessment_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

  IF v_token IS NULL THEN
    SELECT COALESCE(name, 'Aluno') INTO v_client_name
      FROM public.coach_evaluation_clients WHERE id = NEW.client_id;
    INSERT INTO public.assessment_shares (assessment_id, coach_id, client_name)
      VALUES (NEW.id, NEW.coach_id, COALESCE(v_client_name,'Aluno'))
      RETURNING token INTO v_token;
  END IF;

  v_share_url := '/resultado/' || v_token;

  -- Skeletal muscle from FitMindShape is the source of truth for the ranking's "massa muscular"
  v_muscle := COALESCE(NEW.skeletal_muscle, NEW.muscle_mass);

  IF NEW.challenge_type = 'initial' THEN
    UPDATE public.competition_enrollments
       SET initial_weight = COALESCE(NEW.weight, initial_weight),
           initial_body_fat = COALESCE(NEW.body_fat, initial_body_fat),
           initial_muscle_mass = COALESCE(v_muscle, initial_muscle_mass),
           initial_share_url = v_share_url,
           status = CASE WHEN status IN ('enrolled','scheduled_initial') THEN 'weighed_initial' ELSE status END
     WHERE id = NEW.challenge_enrollment_id;
  ELSE
    UPDATE public.competition_enrollments
       SET final_weight = COALESCE(NEW.weight, final_weight),
           final_body_fat = COALESCE(NEW.body_fat, final_body_fat),
           final_muscle_mass = COALESCE(v_muscle, final_muscle_mass),
           final_share_url = v_share_url,
           status = 'weighed_final'
     WHERE id = NEW.challenge_enrollment_id;
  END IF;

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
  AFTER INSERT OR UPDATE OF challenge_enrollment_id, challenge_type, weight, body_fat, muscle_mass, skeletal_muscle
  ON public.coach_body_assessments
  FOR EACH ROW EXECUTE FUNCTION public.sync_challenge_assessment();

-- Backfill existing enrollments with skeletal_muscle where present
UPDATE public.competition_enrollments ce
   SET initial_muscle_mass = COALESCE(a.skeletal_muscle, a.muscle_mass, ce.initial_muscle_mass)
  FROM public.coach_body_assessments a
 WHERE a.challenge_enrollment_id = ce.id
   AND a.challenge_type = 'initial'
   AND a.skeletal_muscle IS NOT NULL;

UPDATE public.competition_enrollments ce
   SET final_muscle_mass = COALESCE(a.skeletal_muscle, a.muscle_mass, ce.final_muscle_mass)
  FROM public.coach_body_assessments a
 WHERE a.challenge_enrollment_id = ce.id
   AND a.challenge_type = 'final'
   AND a.skeletal_muscle IS NOT NULL;