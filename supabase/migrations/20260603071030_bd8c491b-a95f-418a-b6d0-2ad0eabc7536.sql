CREATE OR REPLACE FUNCTION public.student_has_partner_benefits(_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    JOIN public.partners p ON p.id = s.partner_id
    JOIN public.partner_products pp ON pp.partner_id = p.id
    WHERE s.id = _student_id
      AND p.status = 'approved'
      AND pp.status = 'approved'
      AND pp.is_active_by_partner = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.student_has_partner_benefits(uuid) TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.event_attendances (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.fitmind_events(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendances_event ON public.event_attendances(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendances_profile ON public.event_attendances(profile_id);

GRANT SELECT ON public.event_attendances TO anon;
GRANT SELECT, INSERT, DELETE ON public.event_attendances TO authenticated;
GRANT ALL ON public.event_attendances TO service_role;

ALTER TABLE public.event_attendances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "event_attendances_public_select"
  ON public.event_attendances FOR SELECT
  USING (true);

CREATE POLICY "event_attendances_self_insert"
  ON public.event_attendances FOR INSERT TO authenticated
  WITH CHECK (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "event_attendances_self_delete"
  ON public.event_attendances FOR DELETE TO authenticated
  USING (
    profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  );

CREATE POLICY "event_attendances_admin_all"
  ON public.event_attendances FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));
