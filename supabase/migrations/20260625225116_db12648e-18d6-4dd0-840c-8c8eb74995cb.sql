ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS activation_source TEXT
    CHECK (activation_source IN ('purchased','already_coach','admin_grant')),
  ADD COLUMN IF NOT EXISTS activation_granted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activation_note TEXT;

-- Backfill
UPDATE public.coaches
SET activation_source = CASE
  WHEN activation_order_id IS NOT NULL THEN 'purchased'
  WHEN already_coach IS TRUE THEN 'already_coach'
  ELSE 'admin_grant'
END
WHERE activation_paid_at IS NOT NULL
  AND activation_source IS NULL;