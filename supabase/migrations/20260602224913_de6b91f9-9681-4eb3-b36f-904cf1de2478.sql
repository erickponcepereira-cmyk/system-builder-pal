
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS onboarding_stage text NOT NULL DEFAULT 'awaiting_payment',
  ADD COLUMN IF NOT EXISTS quiz_result_url text,
  ADD COLUMN IF NOT EXISTS quiz_result_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_order_id uuid;

-- Coaches already aprovados são considerados released
UPDATE public.coaches
   SET onboarding_stage = 'released'
 WHERE approved_at IS NOT NULL
   AND onboarding_stage = 'awaiting_payment';

CREATE INDEX IF NOT EXISTS idx_coaches_onboarding_stage ON public.coaches(onboarding_stage);
