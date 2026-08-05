-- 1) Ordenação estável na listagem de fichas
CREATE OR REPLACE FUNCTION public.coach_evaluation_client_summaries(_coach_id uuid)
 RETURNS TABLE(id uuid, coach_id uuid, student_id uuid, name text, gender text, ethnicity text, height numeric, height_unit text, birth_date date, language text, groups text[], avatar_url text, created_at timestamp with time zone, assessment_count bigint, last_assessment_at timestamp with time zone, coach_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_coach_id uuid;
  caller_is_master boolean;
BEGIN
  caller_coach_id := public.current_coach_id();
  caller_is_master := public.is_master_coach(caller_coach_id);

  IF caller_coach_id IS NULL OR caller_coach_id <> _coach_id THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH visible_clients AS (
    SELECT c.id,
           c.coach_id,
           c.student_id,
           c.name::text AS name,
           c.gender::text AS gender,
           c.ethnicity::text AS ethnicity,
           c.height,
           c.height_unit::text AS height_unit,
           c.birth_date,
           c.language::text AS language,
           c.groups,
           c.avatar_url::text AS avatar_url,
           c.created_at
    FROM public.coach_evaluation_clients c
    WHERE caller_is_master OR c.coach_id = caller_coach_id
  ), assessment_summary AS (
    SELECT a.client_id,
           COUNT(*)::bigint AS assessment_count,
           MAX(a.assessment_date) AS last_assessment_at
    FROM public.coach_body_assessments a
    JOIN visible_clients vc ON vc.id = a.client_id
    GROUP BY a.client_id
  )
  SELECT vc.id,
         vc.coach_id,
         vc.student_id,
         vc.name,
         vc.gender,
         vc.ethnicity,
         vc.height,
         vc.height_unit,
         vc.birth_date,
         vc.language,
         vc.groups,
         vc.avatar_url,
         vc.created_at,
         COALESCE(s.assessment_count, 0)::bigint AS assessment_count,
         s.last_assessment_at,
         p.name::text AS coach_name
  FROM visible_clients vc
  LEFT JOIN assessment_summary s ON s.client_id = vc.id
  LEFT JOIN public.coaches co ON co.id = vc.coach_id
  LEFT JOIN public.profiles p ON p.id = co.profile_id
  ORDER BY vc.created_at DESC, vc.id DESC;
END;
$function$;

-- 2) Sincroniza a ficha de avaliação com os dados atuais do aluno/perfil
CREATE OR REPLACE FUNCTION public.sync_coach_evaluation_client_for_student(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s RECORD;
  p RECORD;
  v_gender text;
BEGIN
  SELECT id, coach_id, profile_id, height, current_weight
    INTO s
  FROM public.students
  WHERE id = _student_id;

  IF NOT FOUND THEN
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
    ELSE NULL
  END;

  UPDATE public.coach_evaluation_clients c
     SET coach_id   = COALESCE(s.coach_id, c.coach_id),
         name       = COALESCE(NULLIF(TRIM(p.name), ''), c.name),
         email      = COALESCE(p.email, c.email),
         whatsapp   = COALESCE(p.phone, c.whatsapp),
         avatar_url = COALESCE(p.avatar_url, p.photo_url, c.avatar_url),
         gender     = COALESCE(v_gender, c.gender),
         birth_date = COALESCE(p.birthdate, c.birth_date),
         height     = COALESCE(s.height, c.height),
         updated_at = now()
   WHERE c.student_id = s.id;
END;
$function$;

-- 3) Gatilhos: aluno troca de coach / perfil atualizado
CREATE OR REPLACE FUNCTION public.trg_sync_eval_client_from_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id THEN
    PERFORM public.ensure_coach_evaluation_client_for_student(NEW.id);
    PERFORM public.sync_coach_evaluation_client_for_student(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_students_sync_eval_client ON public.students;
CREATE TRIGGER trg_students_sync_eval_client
AFTER UPDATE OF coach_id ON public.students
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_eval_client_from_student();

CREATE OR REPLACE FUNCTION public.trg_sync_eval_client_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.gender IS DISTINCT FROM OLD.gender
     OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
     OR NEW.photo_url IS DISTINCT FROM OLD.photo_url
     OR NEW.birthdate IS DISTINCT FROM OLD.birthdate THEN
    FOR r IN SELECT id FROM public.students WHERE profile_id = NEW.id LOOP
      PERFORM public.sync_coach_evaluation_client_for_student(r.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_profiles_sync_eval_client ON public.profiles;
CREATE TRIGGER trg_profiles_sync_eval_client
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_eval_client_from_profile();

-- 4) Backfill: re-sincroniza todas as fichas ligadas a alunos
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT student_id FROM public.coach_evaluation_clients WHERE student_id IS NOT NULL LOOP
    PERFORM public.sync_coach_evaluation_client_for_student(r.student_id);
  END LOOP;
END $$;