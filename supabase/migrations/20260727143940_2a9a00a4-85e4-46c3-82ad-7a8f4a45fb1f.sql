
-- 1) Consolidate duplicates: pick the oldest client row per student_id as canonical,
--    reassign FKs, delete duplicates.
WITH ranked AS (
  SELECT id, student_id,
         ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at ASC, id ASC) AS rn,
         FIRST_VALUE(id) OVER (PARTITION BY student_id ORDER BY created_at ASC, id ASC) AS canonical_id
    FROM public.coach_evaluation_clients
   WHERE student_id IS NOT NULL
),
dups AS (
  SELECT id AS dup_id, canonical_id
    FROM ranked
   WHERE rn > 1
)
SELECT 1;

-- Reassign coach_body_assessments
UPDATE public.coach_body_assessments a
   SET client_id = r.canonical_id
  FROM (
    SELECT id, FIRST_VALUE(id) OVER (PARTITION BY student_id ORDER BY created_at ASC, id ASC) AS canonical_id
      FROM public.coach_evaluation_clients
     WHERE student_id IS NOT NULL
  ) r
 WHERE a.client_id = r.id
   AND r.id <> r.canonical_id;

-- Reassign student_protocols
UPDATE public.student_protocols sp
   SET evaluation_client_id = r.canonical_id
  FROM (
    SELECT id, FIRST_VALUE(id) OVER (PARTITION BY student_id ORDER BY created_at ASC, id ASC) AS canonical_id
      FROM public.coach_evaluation_clients
     WHERE student_id IS NOT NULL
  ) r
 WHERE sp.evaluation_client_id = r.id
   AND r.id <> r.canonical_id;

-- Reassign professional_anamnesis_external
UPDATE public.professional_anamnesis_external ae
   SET evaluation_client_id = r.canonical_id
  FROM (
    SELECT id, FIRST_VALUE(id) OVER (PARTITION BY student_id ORDER BY created_at ASC, id ASC) AS canonical_id
      FROM public.coach_evaluation_clients
     WHERE student_id IS NOT NULL
  ) r
 WHERE ae.evaluation_client_id = r.id
   AND r.id <> r.canonical_id;

-- Reassign coach_assessment_deletions
UPDATE public.coach_assessment_deletions cd
   SET client_id = r.canonical_id
  FROM (
    SELECT id, FIRST_VALUE(id) OVER (PARTITION BY student_id ORDER BY created_at ASC, id ASC) AS canonical_id
      FROM public.coach_evaluation_clients
     WHERE student_id IS NOT NULL
  ) r
 WHERE cd.client_id = r.id
   AND r.id <> r.canonical_id;

-- Reassign evaluation_link_audit
UPDATE public.evaluation_link_audit el
   SET client_id = r.canonical_id
  FROM (
    SELECT id, FIRST_VALUE(id) OVER (PARTITION BY student_id ORDER BY created_at ASC, id ASC) AS canonical_id
      FROM public.coach_evaluation_clients
     WHERE student_id IS NOT NULL
  ) r
 WHERE el.client_id = r.id
   AND r.id <> r.canonical_id;

-- Delete duplicate client rows now that dependents were re-parented
DELETE FROM public.coach_evaluation_clients
 WHERE id IN (
   SELECT id FROM (
     SELECT id, ROW_NUMBER() OVER (PARTITION BY student_id ORDER BY created_at ASC, id ASC) AS rn
       FROM public.coach_evaluation_clients
      WHERE student_id IS NOT NULL
   ) x WHERE rn > 1
 );

-- 2) Prevent future duplicates: at most one client row per student_id.
CREATE UNIQUE INDEX IF NOT EXISTS coach_evaluation_clients_student_id_unique
  ON public.coach_evaluation_clients (student_id)
  WHERE student_id IS NOT NULL;

-- 3) Update ensure_coach_evaluation_client_for_student to reuse existing rows
CREATE OR REPLACE FUNCTION public.ensure_coach_evaluation_client_for_student(_student_id uuid)
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

  IF NOT FOUND OR s.coach_id IS NULL THEN
    RETURN;
  END IF;

  -- Já existe QUALQUER ficha para este aluno (independente do coach)? Nada a fazer.
  IF EXISTS (
    SELECT 1 FROM public.coach_evaluation_clients
    WHERE student_id = s.id
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
  )
  ON CONFLICT (student_id) WHERE student_id IS NOT NULL DO NOTHING;
END;
$function$;
