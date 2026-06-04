
-- Workout plans (created by coach or student)
CREATE TABLE public.workout_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  coach_id UUID,
  name TEXT NOT NULL,
  day_of_week SMALLINT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_plans TO authenticated;
GRANT ALL ON public.workout_plans TO service_role;
ALTER TABLE public.workout_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own plans" ON public.workout_plans
  FOR SELECT TO authenticated USING (student_id = auth.uid() OR coach_id = auth.uid());
CREATE POLICY "Coaches/students manage plans" ON public.workout_plans
  FOR ALL TO authenticated USING (student_id = auth.uid() OR coach_id = auth.uid())
  WITH CHECK (student_id = auth.uid() OR coach_id = auth.uid());

-- Exercises inside a plan
CREATE TABLE public.workout_exercises (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  exercise_name TEXT NOT NULL,
  exercise_ref_id UUID,
  sets INT NOT NULL DEFAULT 3,
  reps TEXT,
  load_kg NUMERIC,
  rest_seconds INT NOT NULL DEFAULT 60,
  equipment_config TEXT,
  media_url TEXT,
  notes TEXT,
  is_cardio BOOLEAN NOT NULL DEFAULT false,
  cardio_duration_min INT,
  cardio_pace TEXT,
  cardio_speed NUMERIC,
  cardio_elevation NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_exercises TO authenticated;
GRANT ALL ON public.workout_exercises TO service_role;
ALTER TABLE public.workout_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access via parent plan" ON public.workout_exercises
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workout_plans p WHERE p.id = plan_id AND (p.student_id = auth.uid() OR p.coach_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workout_plans p WHERE p.id = plan_id AND (p.student_id = auth.uid() OR p.coach_id = auth.uid())));

-- Sessions (a started/finished workout)
CREATE TABLE public.workout_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL REFERENCES public.workout_plans(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  total_seconds INT,
  completion_pct NUMERIC NOT NULL DEFAULT 0,
  xp_earned INT NOT NULL DEFAULT 0,
  notes TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_sessions TO authenticated;
GRANT ALL ON public.workout_sessions TO service_role;
ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student or coach can read sessions" ON public.workout_sessions
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR EXISTS (SELECT 1 FROM public.workout_plans p WHERE p.id = plan_id AND p.coach_id = auth.uid()));
CREATE POLICY "Student manages own sessions" ON public.workout_sessions
  FOR ALL TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

-- Per-set log
CREATE TABLE public.workout_session_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
  set_number INT NOT NULL,
  reps_done INT,
  load_kg NUMERIC,
  rest_seconds_actual INT,
  rest_exceeded BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_session_logs TO authenticated;
GRANT ALL ON public.workout_session_logs TO service_role;
ALTER TABLE public.workout_session_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access set logs via session" ON public.workout_session_logs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workout_sessions s JOIN public.workout_plans p ON p.id = s.plan_id WHERE s.id = session_id AND (s.student_id = auth.uid() OR p.coach_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workout_sessions s WHERE s.id = session_id AND s.student_id = auth.uid()));

-- Cardio logs
CREATE TABLE public.workout_cardio_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID NOT NULL REFERENCES public.workout_exercises(id) ON DELETE CASCADE,
  duration_min NUMERIC,
  distance_km NUMERIC,
  pace TEXT,
  speed NUMERIC,
  elevation NUMERIC,
  calories INT,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_cardio_logs TO authenticated;
GRANT ALL ON public.workout_cardio_logs TO service_role;
ALTER TABLE public.workout_cardio_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Access cardio via session" ON public.workout_cardio_logs
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workout_sessions s JOIN public.workout_plans p ON p.id = s.plan_id WHERE s.id = session_id AND (s.student_id = auth.uid() OR p.coach_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workout_sessions s WHERE s.id = session_id AND s.student_id = auth.uid()));

-- Achievements
CREATE TABLE public.workout_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workout_achievements TO authenticated;
GRANT ALL ON public.workout_achievements TO service_role;
ALTER TABLE public.workout_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student or any coach reads achievements" ON public.workout_achievements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Student manages own achievements" ON public.workout_achievements
  FOR ALL TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

-- updated_at trigger for plans
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_workout_plans_updated_at
  BEFORE UPDATE ON public.workout_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
