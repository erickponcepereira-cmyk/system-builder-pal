-- Multi-role visibility + responsible coach
ALTER TABLE public.fitmind_events
  ADD COLUMN IF NOT EXISTS visibility_roles text[] NOT NULL DEFAULT ARRAY['todos']::text[],
  ADD COLUMN IF NOT EXISTS responsible_coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fitmind_events_responsible_coach ON public.fitmind_events(responsible_coach_id);
CREATE INDEX IF NOT EXISTS idx_fitmind_events_visibility_roles ON public.fitmind_events USING GIN (visibility_roles);

-- Backfill visibility_roles from legacy single-value visibility column
UPDATE public.fitmind_events
SET visibility_roles = ARRAY[visibility::text]
WHERE visibility_roles = ARRAY['todos']::text[]
  AND visibility::text <> 'todos';
