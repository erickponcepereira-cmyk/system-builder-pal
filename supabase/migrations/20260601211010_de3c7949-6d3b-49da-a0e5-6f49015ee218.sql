
ALTER TABLE public.store_sections
  ADD COLUMN IF NOT EXISTS card_width INTEGER,
  ADD COLUMN IF NOT EXISTS card_height INTEGER;

ALTER TABLE public.store_categories
  ADD COLUMN IF NOT EXISTS card_width INTEGER,
  ADD COLUMN IF NOT EXISTS card_height INTEGER;
