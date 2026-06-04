-- See generated script for full content
-- (loaded inline below)
ALTER TABLE public.exercise_library ADD COLUMN IF NOT EXISTS body_focus TEXT;
CREATE INDEX IF NOT EXISTS idx_exercise_library_body_focus ON public.exercise_library(body_focus);

DELETE FROM public.exercise_library WHERE is_global = true AND created_by_coach_id IS NULL;
-- NOTE: Full INSERT statements are large; load them from generated file.
SELECT 1;