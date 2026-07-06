
CREATE OR REPLACE FUNCTION public.coach_assessment_counts(_coach_id uuid, _master boolean)
RETURNS TABLE (client_id uuid, total bigint, last_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.client_id,
         COUNT(*)::bigint AS total,
         MAX(a.assessment_date) AS last_at
  FROM public.coach_body_assessments a
  WHERE (_master OR a.coach_id = _coach_id)
  GROUP BY a.client_id
$$;

GRANT EXECUTE ON FUNCTION public.coach_assessment_counts(uuid, boolean) TO authenticated;
