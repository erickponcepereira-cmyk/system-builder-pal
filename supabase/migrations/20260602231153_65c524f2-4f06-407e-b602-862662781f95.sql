-- Track ID unlock attempts (audit + rate limiting)
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS unlock_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_unlock_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_unlock_failed_at TIMESTAMPTZ;

-- Audit log of every unlock attempt (success or failure)
CREATE TABLE IF NOT EXISTS public.coach_unlock_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL,
  attempted_number INTEGER NOT NULL,
  success BOOLEAN NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_unlock_attempts_coach ON public.coach_unlock_attempts(coach_id);
CREATE INDEX IF NOT EXISTS idx_coach_unlock_attempts_created ON public.coach_unlock_attempts(created_at DESC);

GRANT SELECT ON public.coach_unlock_attempts TO authenticated;
GRANT ALL ON public.coach_unlock_attempts TO service_role;

ALTER TABLE public.coach_unlock_attempts ENABLE ROW LEVEL SECURITY;

-- Coach can see only their own attempts; admins can see all
CREATE POLICY "Coach sees own unlock attempts"
ON public.coach_unlock_attempts
FOR SELECT
TO authenticated
USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
);
