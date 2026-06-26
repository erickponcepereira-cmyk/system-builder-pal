CREATE OR REPLACE FUNCTION public.search_approved_coaches(_query text DEFAULT NULL, _limit int DEFAULT 50)
RETURNS TABLE (
  coach_id uuid,
  profile_id uuid,
  name text,
  city text,
  state text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id AS coach_id,
         p.id AS profile_id,
         p.name,
         p.city,
         p.state
  FROM public.coaches c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.approved_at IS NOT NULL
    AND c.blocked_at IS NULL
    AND p.name IS NOT NULL
    AND (
      _query IS NULL
      OR length(trim(_query)) = 0
      OR p.name ILIKE '%' || _query || '%'
      OR COALESCE(p.city,'') ILIKE '%' || _query || '%'
    )
  ORDER BY p.name ASC
  LIMIT GREATEST(1, LEAST(_limit, 200));
$$;

REVOKE ALL ON FUNCTION public.search_approved_coaches(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_approved_coaches(text, int) TO anon, authenticated;