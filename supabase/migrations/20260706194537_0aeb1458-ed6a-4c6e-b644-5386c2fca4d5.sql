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
  ORDER BY vc.created_at DESC;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.coach_evaluation_client_summaries(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.coach_evaluation_client_summaries(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coach_evaluation_client_summaries(uuid) TO authenticated;

ALTER TABLE public.partner_products
ADD COLUMN IF NOT EXISTS original_price numeric;

ALTER TABLE public.professional_products
ADD COLUMN IF NOT EXISTS original_price numeric;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'partner_products_original_price_nonnegative'
      AND conrelid = 'public.partner_products'::regclass
  ) THEN
    ALTER TABLE public.partner_products
    ADD CONSTRAINT partner_products_original_price_nonnegative
    CHECK (original_price IS NULL OR original_price >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'professional_products_original_price_nonnegative'
      AND conrelid = 'public.professional_products'::regclass
  ) THEN
    ALTER TABLE public.professional_products
    ADD CONSTRAINT professional_products_original_price_nonnegative
    CHECK (original_price IS NULL OR original_price >= 0);
  END IF;
END $$;