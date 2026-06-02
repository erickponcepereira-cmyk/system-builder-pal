
-- Add finalization metadata to competitions
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_by UUID;

-- Audit log of every finalize action (immutable history)
CREATE TABLE IF NOT EXISTS public.competition_finalization_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  finalized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_by UUID,
  winner_male_enrollment_id UUID,
  winner_female_enrollment_id UUID,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.competition_finalization_log TO authenticated;
GRANT ALL ON public.competition_finalization_log TO service_role;

ALTER TABLE public.competition_finalization_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "finalization_log_admin_all"
  ON public.competition_finalization_log
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "finalization_log_read_all"
  ON public.competition_finalization_log
  FOR SELECT TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_finalization_log_comp
  ON public.competition_finalization_log(competition_id, finalized_at DESC);
