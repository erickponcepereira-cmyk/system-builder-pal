
-- Pre-registration table for FitMind events
CREATE TYPE public.event_registration_status AS ENUM ('registered', 'attended', 'no_show');

CREATE TABLE public.event_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.fitmind_events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.event_registration_status NOT NULL DEFAULT 'registered',
  notes text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, profile_id)
);

CREATE INDEX idx_event_registrations_event ON public.event_registrations(event_id);
CREATE INDEX idx_event_registrations_profile ON public.event_registrations(profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_registrations TO authenticated;
GRANT ALL ON public.event_registrations TO service_role;

ALTER TABLE public.event_registrations ENABLE ROW LEVEL SECURITY;

-- Helper: is user the responsible coach / event creator badge / admin for an event
CREATE OR REPLACE FUNCTION public.can_manage_event(_user_id uuid, _event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.fitmind_events e
      JOIN public.coaches c ON c.id = e.responsible_coach_id
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE e.id = _event_id AND p.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.coach_badges b
      JOIN public.coaches c ON c.id = b.coach_id
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = _user_id AND b.badge_key = 'event_creator'
    );
$$;

-- Students: see their own registrations
CREATE POLICY "users see own registrations"
ON public.event_registrations FOR SELECT TO authenticated
USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Students: register themselves
CREATE POLICY "users register themselves"
ON public.event_registrations FOR INSERT TO authenticated
WITH CHECK (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  AND status = 'registered'
);

-- Students: cancel their own (delete) if still registered
CREATE POLICY "users cancel own registration"
ON public.event_registrations FOR DELETE TO authenticated
USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  AND status = 'registered'
);

-- Managers (admin, event creator, responsible coach): full read
CREATE POLICY "managers read registrations"
ON public.event_registrations FOR SELECT TO authenticated
USING (public.can_manage_event(auth.uid(), event_id));

-- Managers: update status (attended/no_show)
CREATE POLICY "managers update registrations"
ON public.event_registrations FOR UPDATE TO authenticated
USING (public.can_manage_event(auth.uid(), event_id))
WITH CHECK (public.can_manage_event(auth.uid(), event_id));

-- Managers: insert (e.g. manual roster) and delete
CREATE POLICY "managers insert registrations"
ON public.event_registrations FOR INSERT TO authenticated
WITH CHECK (public.can_manage_event(auth.uid(), event_id));

CREATE POLICY "managers delete registrations"
ON public.event_registrations FOR DELETE TO authenticated
USING (public.can_manage_event(auth.uid(), event_id));

-- updated_at trigger
CREATE TRIGGER trg_event_registrations_updated_at
BEFORE UPDATE ON public.event_registrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-sync: when QR attendance is inserted, upsert registration as 'attended'
CREATE OR REPLACE FUNCTION public.sync_event_registration_on_attendance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.event_registrations (event_id, profile_id, status)
  VALUES (NEW.event_id, NEW.profile_id, 'attended')
  ON CONFLICT (event_id, profile_id)
  DO UPDATE SET status = 'attended', updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_registration_on_attendance
AFTER INSERT ON public.event_attendances
FOR EACH ROW EXECUTE FUNCTION public.sync_event_registration_on_attendance();
