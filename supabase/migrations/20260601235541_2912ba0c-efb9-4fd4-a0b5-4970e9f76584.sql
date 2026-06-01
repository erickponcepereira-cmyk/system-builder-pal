ALTER TABLE public.window_method_logs
  ADD COLUMN IF NOT EXISTS meal_1_exercise boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meal_2_exercise boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meal_3_exercise boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meal_4_exercise boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meal_5_exercise boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meal_6_exercise boolean NOT NULL DEFAULT false;