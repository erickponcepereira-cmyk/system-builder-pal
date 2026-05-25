CREATE TABLE IF NOT EXISTS public.assessment_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         TEXT UNIQUE NOT NULL DEFAULT left(replace(gen_random_uuid()::text, '-', ''), 20),
  assessment_id UUID NOT NULL,
  coach_id      UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  client_name   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ,
  view_count    INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS assessment_shares_token_idx
  ON public.assessment_shares (token);

CREATE INDEX IF NOT EXISTS assessment_shares_assessment_coach_idx
  ON public.assessment_shares (assessment_id, coach_id);

ALTER TABLE public.assessment_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Coaches can manage own shares" ON public.assessment_shares;
CREATE POLICY "Coaches can manage own shares"
  ON public.assessment_shares FOR ALL
  USING (
    coach_id IN (
      SELECT c.id FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    coach_id IN (
      SELECT c.id FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Public can read share by token" ON public.assessment_shares;
CREATE POLICY "Public can read share by token"
  ON public.assessment_shares FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.increment_share_view(p_token TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.assessment_shares
  SET view_count = view_count + 1
  WHERE token = p_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_share_view(TEXT) TO anon, authenticated;