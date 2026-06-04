ALTER TABLE public.student_protocols
  ADD COLUMN IF NOT EXISTS workout_goal TEXT,
  ADD COLUMN IF NOT EXISTS workout_level TEXT,
  ADD COLUMN IF NOT EXISTS workout_name TEXT;