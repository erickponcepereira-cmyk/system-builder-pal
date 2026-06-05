
ALTER TABLE public.workout_exercises
  ADD COLUMN IF NOT EXISTS rest_seconds_max INTEGER,
  ADD COLUMN IF NOT EXISTS equipment_config_user TEXT;

ALTER TABLE public.workout_session_logs
  ADD COLUMN IF NOT EXISTS equipment_config TEXT;
