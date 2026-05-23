ALTER TABLE public.career_plan_progress
  ADD COLUMN IF NOT EXISTS reward_delivered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reward_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS reward_delivered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_notes text;

CREATE INDEX IF NOT EXISTS idx_career_plan_progress_pending_delivery
  ON public.career_plan_progress (reward_earned, reward_delivered)
  WHERE reward_earned = true AND reward_delivered = false;