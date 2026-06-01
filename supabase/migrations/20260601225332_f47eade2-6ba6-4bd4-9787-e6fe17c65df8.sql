-- Add water goal and food restrictions to students record
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS water_goal_ml integer,
  ADD COLUMN IF NOT EXISTS food_restrictions text[] NOT NULL DEFAULT '{}';

-- Daily water intake logs (gamification)
CREATE TABLE IF NOT EXISTS public.student_water_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  amount_ml integer NOT NULL CHECK (amount_ml > 0 AND amount_ml <= 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_water_logs_student_date
  ON public.student_water_logs (student_id, log_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_water_logs TO authenticated;
GRANT ALL ON public.student_water_logs TO service_role;

ALTER TABLE public.student_water_logs ENABLE ROW LEVEL SECURITY;

-- Owner (student) can manage own logs
CREATE POLICY "Students manage own water logs"
ON public.student_water_logs
FOR ALL
TO authenticated
USING (
  student_id IN (
    SELECT s.id FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  student_id IN (
    SELECT s.id FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid()
  )
);

-- Coach assigned to the student can read
CREATE POLICY "Coach reads student water logs"
ON public.student_water_logs
FOR SELECT
TO authenticated
USING (
  student_id IN (
    SELECT s.id FROM public.students s
    JOIN public.coaches c ON c.id = s.coach_id
    JOIN public.profiles cp ON cp.id = c.profile_id
    WHERE cp.user_id = auth.uid()
  )
);

-- Admins can read
CREATE POLICY "Admins read water logs"
ON public.student_water_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'
  )
);
