
ALTER TABLE public.store_items
  ADD COLUMN IF NOT EXISTS tax_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS card_fee_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS app_fee_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS marketing_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS other_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS commission_coach_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS commission_level1_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS commission_level2_mode text NOT NULL DEFAULT 'percent',
  ADD COLUMN IF NOT EXISTS commission_level3_mode text NOT NULL DEFAULT 'percent';
