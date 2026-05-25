ALTER TABLE public.store_sections ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.store_categories ADD COLUMN IF NOT EXISTS image_url TEXT;