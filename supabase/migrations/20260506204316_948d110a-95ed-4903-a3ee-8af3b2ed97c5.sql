ALTER TABLE public.internal_appointments
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_internal_appointments_coach_completed
  ON public.internal_appointments(coach_id, completed_at)
  WHERE completed_at IS NOT NULL;