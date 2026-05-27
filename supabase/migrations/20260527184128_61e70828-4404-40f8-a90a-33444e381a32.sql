-- Smarter nutritionist resolver: try upline first, then any active nutritionist partner.
CREATE OR REPLACE FUNCTION public.find_nutritionist_for(_coach_id uuid)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- 1) own coach or upline with badge
  v_id := public.find_upline_with_badge(_coach_id, 'nutritionist_partner'::public.coach_badge_key);
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- 2) fallback: any active (non-blocked) coach holding the badge
  SELECT c.id INTO v_id
  FROM public.coaches c
  JOIN public.coach_badges cb ON cb.coach_id = c.id AND cb.badge_key = 'nutritionist_partner'::public.coach_badge_key
  WHERE c.blocked_at IS NULL
  ORDER BY cb.granted_at ASC
  LIMIT 1;

  RETURN v_id;
END;
$$;