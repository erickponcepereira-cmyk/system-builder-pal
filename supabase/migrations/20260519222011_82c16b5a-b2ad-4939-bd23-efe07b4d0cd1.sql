
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS facebook text,
  ADD COLUMN IF NOT EXISTS youtube text,
  ADD COLUMN IF NOT EXISTS tiktok text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.student_protocols
  ADD COLUMN IF NOT EXISTS meal_notes jsonb NOT NULL DEFAULT '[]'::jsonb;
