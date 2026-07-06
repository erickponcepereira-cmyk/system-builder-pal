ALTER TABLE public.coach_body_assessments
ADD COLUMN IF NOT EXISTS scale_number text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coach_body_assessments_scale_number_len'
      AND conrelid = 'public.coach_body_assessments'::regclass
  ) THEN
    ALTER TABLE public.coach_body_assessments
    ADD CONSTRAINT coach_body_assessments_scale_number_len
    CHECK (scale_number IS NULL OR char_length(trim(scale_number)) BETWEEN 1 AND 50);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cba_client_assessment_date
ON public.coach_body_assessments (client_id, assessment_date DESC);

CREATE INDEX IF NOT EXISTS idx_cec_coach_created_at
ON public.coach_evaluation_clients (coach_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cec_created_at
ON public.coach_evaluation_clients (created_at DESC);

CREATE OR REPLACE FUNCTION public.coach_assessment_counts(_coach_id uuid, _master boolean DEFAULT false)
RETURNS TABLE(client_id uuid, total bigint, last_at timestamp with time zone)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  SELECT a.client_id,
         COUNT(*)::bigint AS total,
         MAX(a.assessment_date) AS last_at
  FROM public.coach_body_assessments a
  WHERE (caller_is_master OR a.coach_id = caller_coach_id)
  GROUP BY a.client_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.coach_evaluation_client_summaries(_coach_id uuid)
RETURNS TABLE(
  id uuid,
  coach_id uuid,
  student_id uuid,
  name text,
  gender text,
  ethnicity text,
  height numeric,
  height_unit text,
  birth_date date,
  language text,
  groups text[],
  avatar_url text,
  created_at timestamp with time zone,
  assessment_count bigint,
  last_assessment_at timestamp with time zone,
  coach_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
           c.name,
           c.gender,
           c.ethnicity,
           c.height,
           c.height_unit,
           c.birth_date,
           c.language,
           c.groups,
           c.avatar_url,
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
         p.name AS coach_name
  FROM visible_clients vc
  LEFT JOIN assessment_summary s ON s.client_id = vc.id
  LEFT JOIN public.coaches co ON co.id = vc.coach_id
  LEFT JOIN public.profiles p ON p.id = co.profile_id
  ORDER BY vc.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.coach_assessment_counts(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coach_evaluation_client_summaries(uuid) TO authenticated;