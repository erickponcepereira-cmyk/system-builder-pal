
-- =========================================================
-- coach_google_tokens
-- =========================================================
CREATE TABLE public.coach_google_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.coaches(id) ON DELETE CASCADE,
  google_email TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  token_type TEXT DEFAULT 'Bearer',
  scope TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.coach_google_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can read own google tokens"
  ON public.coach_google_tokens FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

-- Writes are restricted to service role only (server functions using admin client).
-- No INSERT/UPDATE/DELETE policy for authenticated users.

CREATE TRIGGER coach_google_tokens_updated_at
  BEFORE UPDATE ON public.coach_google_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_coach_google_tokens_coach ON public.coach_google_tokens(coach_id);

-- =========================================================
-- internal_appointments
-- =========================================================
CREATE TABLE public.internal_appointments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  google_event_id TEXT,
  summary TEXT NOT NULL DEFAULT '(Sem título)',
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  attendee_name TEXT,
  attendee_email TEXT,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  location TEXT,
  status TEXT NOT NULL DEFAULT 'confirmed',
  html_link TEXT,
  source TEXT NOT NULL DEFAULT 'google',
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, google_event_id)
);

ALTER TABLE public.internal_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach reads own appointments, admin reads all"
  ON public.internal_appointments FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR coach_id = public.current_coach_id()
  );

CREATE POLICY "Coach manages own appointments"
  ON public.internal_appointments FOR INSERT
  WITH CHECK (coach_id = public.current_coach_id());

CREATE POLICY "Coach updates own appointments"
  ON public.internal_appointments FOR UPDATE
  USING (coach_id = public.current_coach_id());

CREATE POLICY "Coach deletes own appointments"
  ON public.internal_appointments FOR DELETE
  USING (coach_id = public.current_coach_id());

CREATE TRIGGER internal_appointments_updated_at
  BEFORE UPDATE ON public.internal_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_internal_appointments_coach_start ON public.internal_appointments(coach_id, start_at);
CREATE INDEX idx_internal_appointments_start ON public.internal_appointments(start_at);

-- =========================================================
-- oauth_states (CSRF protection for Google OAuth)
-- =========================================================
CREATE TABLE public.oauth_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  redirect_to TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- No public policies; service role only.
