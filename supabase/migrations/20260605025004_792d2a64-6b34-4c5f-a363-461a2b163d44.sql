
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS can_create_fitmind_events BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.can_create_fitmind_events(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = _user_id AND c.can_create_fitmind_events = true
  );
$$;

DROP POLICY IF EXISTS fitmind_events_coach_creator_insert ON public.fitmind_events;
DROP POLICY IF EXISTS fitmind_events_coach_creator_update ON public.fitmind_events;
DROP POLICY IF EXISTS fitmind_events_coach_creator_delete ON public.fitmind_events;

CREATE POLICY fitmind_events_coach_creator_insert ON public.fitmind_events
  FOR INSERT TO authenticated
  WITH CHECK (public.can_create_fitmind_events(auth.uid()));

CREATE POLICY fitmind_events_coach_creator_update ON public.fitmind_events
  FOR UPDATE TO authenticated
  USING (public.can_create_fitmind_events(auth.uid()))
  WITH CHECK (public.can_create_fitmind_events(auth.uid()));

CREATE POLICY fitmind_events_coach_creator_delete ON public.fitmind_events
  FOR DELETE TO authenticated
  USING (public.can_create_fitmind_events(auth.uid()));
