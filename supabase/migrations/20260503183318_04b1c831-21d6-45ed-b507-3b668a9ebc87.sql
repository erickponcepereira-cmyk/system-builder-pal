ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS completed_coach_course boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coach_course_notes text;