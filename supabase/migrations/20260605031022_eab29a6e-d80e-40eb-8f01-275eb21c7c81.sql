CREATE OR REPLACE FUNCTION public.can_create_fitmind_events(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.coaches c ON c.profile_id = p.id
    JOIN public.coach_badges cb ON cb.coach_id = c.id
    WHERE p.user_id = _user_id
      AND cb.badge_key = 'event_creator'::public.coach_badge_key
  );
$$;