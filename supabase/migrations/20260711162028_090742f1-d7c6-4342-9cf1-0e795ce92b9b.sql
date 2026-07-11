
-- 1. Função idempotente que garante uma ficha em coach_evaluation_clients para um aluno
CREATE OR REPLACE FUNCTION public.ensure_coach_evaluation_client_for_student(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  p RECORD;
  v_gender text;
BEGIN
  SELECT id, coach_id, profile_id, height, current_weight
    INTO s
  FROM public.students
  WHERE id = _student_id;

  IF NOT FOUND OR s.coach_id IS NULL THEN
    RETURN;
  END IF;

  -- Já existe ficha para este aluno neste coach? Nada a fazer.
  IF EXISTS (
    SELECT 1 FROM public.coach_evaluation_clients
    WHERE student_id = s.id AND coach_id = s.coach_id
  ) THEN
    RETURN;
  END IF;

  SELECT name, email, phone, avatar_url, photo_url, gender, birthdate
    INTO p
  FROM public.profiles
  WHERE id = s.profile_id;

  v_gender := CASE upper(COALESCE(p.gender, ''))
    WHEN 'M' THEN 'male'
    WHEN 'F' THEN 'female'
    WHEN 'O' THEN 'other'
    ELSE 'other'
  END;

  INSERT INTO public.coach_evaluation_clients (
    coach_id, student_id, name, email, whatsapp,
    avatar_url, gender, language, height, current_weight, birth_date, groups
  ) VALUES (
    s.coach_id,
    s.id,
    COALESCE(NULLIF(TRIM(p.name), ''), 'Aluno'),
    p.email,
    p.phone,
    COALESCE(p.avatar_url, p.photo_url),
    v_gender,
    'pt',
    s.height,
    s.current_weight,
    p.birthdate,
    '{}'::text[]
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_coach_evaluation_client_for_student(uuid) TO authenticated, service_role;

-- 2. Trigger wrapper
CREATE OR REPLACE FUNCTION public.tg_students_ensure_eval_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.ensure_coach_evaluation_client_for_student(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_ensure_eval_client_ins ON public.students;
DROP TRIGGER IF EXISTS trg_students_ensure_eval_client_upd ON public.students;

-- 3. Backfill dos alunos existentes SEM ficha (antes de criar o trigger p/ evitar ruído)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT s.id
    FROM public.students s
    LEFT JOIN public.coach_evaluation_clients c
      ON c.student_id = s.id AND c.coach_id = s.coach_id
    WHERE c.id IS NULL
  LOOP
    PERFORM public.ensure_coach_evaluation_client_for_student(r.id);
  END LOOP;
END $$;

-- 4. Triggers para cadastros novos e transferências de coach
CREATE TRIGGER trg_students_ensure_eval_client_ins
AFTER INSERT ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.tg_students_ensure_eval_client();

CREATE TRIGGER trg_students_ensure_eval_client_upd
AFTER UPDATE OF coach_id ON public.students
FOR EACH ROW
WHEN (NEW.coach_id IS DISTINCT FROM OLD.coach_id)
EXECUTE FUNCTION public.tg_students_ensure_eval_client();
