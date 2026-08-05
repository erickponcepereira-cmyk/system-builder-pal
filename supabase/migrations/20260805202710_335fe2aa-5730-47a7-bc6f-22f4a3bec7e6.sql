ALTER TABLE public.students ADD COLUMN IF NOT EXISTS coach_assignment_pending boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.ensure_student_row_for_profile(_profile_id uuid, _coach_id uuid DEFAULT NULL, _pending boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_coach uuid;
  v_code text;
  i int := 0;
BEGIN
  SELECT id INTO v_id FROM public.students WHERE profile_id = _profile_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  v_coach := _coach_id;
  IF v_coach IS NULL THEN
    SELECT c.id INTO v_coach FROM public.coaches c
     WHERE c.id = 'f9a44c8a-31ea-4ca1-8cef-b9049733c5e1';
  END IF;
  IF v_coach IS NULL THEN
    SELECT c.id INTO v_coach FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
     WHERE c.approved_at IS NOT NULL AND c.blocked_at IS NULL AND p.role = 'admin'
     LIMIT 1;
  END IF;
  IF v_coach IS NULL THEN RETURN NULL; END IF;

  LOOP
    i := i + 1;
    v_code := 'FC' || upper(substr(md5(random()::text), 1, 6));
    BEGIN
      INSERT INTO public.students (profile_id, coach_id, referral_code, referral_link, coach_assignment_pending)
      VALUES (_profile_id, v_coach, v_code, '/i/' || v_code, COALESCE(_pending, false))
      RETURNING id INTO v_id;
      RETURN v_id;
    EXCEPTION WHEN unique_violation THEN
      IF i >= 5 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_profile_ensure_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.role::text, 'student') = 'student' AND NEW.merged_into_profile_id IS NULL THEN
    PERFORM public.ensure_student_row_for_profile(NEW.id, NULL, true);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_created_ensure_student ON public.profiles;
CREATE TRIGGER on_profile_created_ensure_student
AFTER INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_profile_ensure_student();

-- Backfill dos perfis de aluno orfaos
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.id FROM public.profiles p
    LEFT JOIN public.students s ON s.profile_id = p.id
    LEFT JOIN public.coaches c ON c.profile_id = p.id
    WHERE p.role = 'student' AND s.id IS NULL AND c.id IS NULL
      AND p.merged_into_profile_id IS NULL
  LOOP
    PERFORM public.ensure_student_row_for_profile(r.id, NULL, true);
  END LOOP;
END $$;