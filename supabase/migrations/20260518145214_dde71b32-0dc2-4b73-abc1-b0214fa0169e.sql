ALTER TABLE public.exercise_library
  ADD COLUMN IF NOT EXISTS gif_url text,
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'video' CHECK (media_type IN ('video','gif','image'));