
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_category') THEN
    CREATE TYPE public.event_category AS ENUM (
      'aula','workshop','desafio','palestra','avaliacao','comemorativo','networking','outro'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'event_visibility') THEN
    CREATE TYPE public.event_visibility AS ENUM (
      'todos','coaches','alunos','parceiros','profissionais'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fitmind_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  subtitle        TEXT,
  description     TEXT,
  location        TEXT,
  image_url       TEXT,
  color           TEXT,
  category        public.event_category NOT NULL DEFAULT 'aula',
  visibility      public.event_visibility NOT NULL DEFAULT 'todos',
  tags            TEXT[],
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  all_day         BOOLEAN NOT NULL DEFAULT false,
  is_highlighted  BOOLEAN NOT NULL DEFAULT false,
  is_important    BOOLEAN NOT NULL DEFAULT false,
  highlight_color TEXT,
  highlight_label TEXT,
  google_calendar_title       TEXT,
  google_calendar_description TEXT,
  google_calendar_location    TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fitmind_events TO authenticated;
GRANT ALL ON public.fitmind_events TO service_role;

CREATE TABLE IF NOT EXISTS public.fitmind_highlighted_days (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date            DATE NOT NULL UNIQUE,
  label           TEXT NOT NULL,
  description     TEXT,
  color           TEXT,
  icon            TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fitmind_highlighted_days TO authenticated;
GRANT ALL ON public.fitmind_highlighted_days TO service_role;

CREATE INDEX IF NOT EXISTS idx_fitmind_events_starts_at      ON public.fitmind_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_fitmind_events_is_active      ON public.fitmind_events(is_active);
CREATE INDEX IF NOT EXISTS idx_fitmind_events_is_highlighted ON public.fitmind_events(is_highlighted);
CREATE INDEX IF NOT EXISTS idx_fitmind_events_category       ON public.fitmind_events(category);
CREATE INDEX IF NOT EXISTS idx_fitmind_events_visibility     ON public.fitmind_events(visibility);
CREATE INDEX IF NOT EXISTS idx_fitmind_highlighted_days_date ON public.fitmind_highlighted_days(date);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fitmind_events_updated_at ON public.fitmind_events;
CREATE TRIGGER fitmind_events_updated_at
  BEFORE UPDATE ON public.fitmind_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS fitmind_highlighted_days_updated_at ON public.fitmind_highlighted_days;
CREATE TRIGGER fitmind_highlighted_days_updated_at
  BEFORE UPDATE ON public.fitmind_highlighted_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fitmind_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitmind_highlighted_days ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fitmind_events_read ON public.fitmind_events;
CREATE POLICY fitmind_events_read
  ON public.fitmind_events FOR SELECT
  USING (
    is_active = true
    AND (
      visibility = 'todos'
      OR (visibility = 'coaches'       AND EXISTS (SELECT 1 FROM public.coaches  WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())))
      OR (visibility = 'alunos'        AND EXISTS (SELECT 1 FROM public.students WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())))
      OR (visibility = 'parceiros'     AND EXISTS (SELECT 1 FROM public.partners WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()) AND status = 'active'))
      OR (visibility = 'profissionais' AND EXISTS (SELECT 1 FROM public.coaches  WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())))
      OR public.is_admin(auth.uid())
    )
  );

DROP POLICY IF EXISTS fitmind_events_admin ON public.fitmind_events;
CREATE POLICY fitmind_events_admin
  ON public.fitmind_events FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS fitmind_highlighted_days_read ON public.fitmind_highlighted_days;
CREATE POLICY fitmind_highlighted_days_read
  ON public.fitmind_highlighted_days FOR SELECT
  USING (is_active = true OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS fitmind_highlighted_days_admin ON public.fitmind_highlighted_days;
CREATE POLICY fitmind_highlighted_days_admin
  ON public.fitmind_highlighted_days FOR ALL
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_fitmind_events(
  _from TIMESTAMPTZ DEFAULT NOW(),
  _to   TIMESTAMPTZ DEFAULT NOW() + INTERVAL '3 months'
)
RETURNS TABLE (
  id              UUID,
  title           TEXT,
  subtitle        TEXT,
  description     TEXT,
  location        TEXT,
  image_url       TEXT,
  color           TEXT,
  category        public.event_category,
  visibility      public.event_visibility,
  tags            TEXT[],
  starts_at       TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  all_day         BOOLEAN,
  is_highlighted  BOOLEAN,
  is_important    BOOLEAN,
  highlight_color TEXT,
  highlight_label TEXT,
  google_calendar_title       TEXT,
  google_calendar_description TEXT,
  google_calendar_location    TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    id, title, subtitle, description, location, image_url, color,
    category, visibility, tags, starts_at, ends_at, all_day,
    is_highlighted, is_important, highlight_color, highlight_label,
    google_calendar_title, google_calendar_description, google_calendar_location
  FROM public.fitmind_events
  WHERE is_active = true
    AND starts_at <= _to
    AND ends_at   >= _from
    AND (
      visibility = 'todos'
      OR (visibility = 'coaches'       AND EXISTS (SELECT 1 FROM public.coaches  WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())))
      OR (visibility = 'alunos'        AND EXISTS (SELECT 1 FROM public.students WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())))
      OR (visibility = 'parceiros'     AND EXISTS (SELECT 1 FROM public.partners WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid()) AND status = 'active'))
      OR (visibility = 'profissionais' AND EXISTS (SELECT 1 FROM public.coaches  WHERE profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())))
      OR public.is_admin(auth.uid())
    )
  ORDER BY starts_at;
$$;

GRANT EXECUTE ON FUNCTION public.get_fitmind_events(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
