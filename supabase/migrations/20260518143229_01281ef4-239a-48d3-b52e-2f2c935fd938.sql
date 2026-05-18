
-- Biblioteca de exercícios
CREATE TABLE public.exercise_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  muscle_group text,
  equipment text,
  difficulty text,
  description text,
  video_url text,
  image_url text,
  is_global boolean NOT NULL DEFAULT false,
  created_by_coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exercise_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_library_read_all" ON public.exercise_library
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "exercise_library_coach_insert" ON public.exercise_library
  FOR INSERT TO authenticated WITH CHECK (
    created_by_coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id WHERE p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND role='admin')
  );
CREATE POLICY "exercise_library_coach_update" ON public.exercise_library
  FOR UPDATE TO authenticated USING (
    created_by_coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id WHERE p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND role='admin')
  );
CREATE POLICY "exercise_library_coach_delete" ON public.exercise_library
  FOR DELETE TO authenticated USING (
    created_by_coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id WHERE p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND role='admin')
  );

-- Protocolo (alimentação + saúde + metas) por aluno
CREATE TABLE public.student_protocols (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  meals_per_day int,
  ideal_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  meal_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  shopping_list text,
  marmita_tips text,
  restrictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  daily_calorie_goal int,
  water_goal_ml int,
  weight_goal numeric(5,2),
  general_notes text,
  workout_plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.student_protocols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "protocols_coach_full" ON public.student_protocols
  FOR ALL TO authenticated
  USING (
    coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id WHERE p.user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND role='admin')
  )
  WITH CHECK (
    coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id WHERE p.user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id=auth.uid() AND role='admin')
  );

CREATE POLICY "protocols_student_read" ON public.student_protocols
  FOR SELECT TO authenticated USING (
    student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id=s.profile_id WHERE p.user_id=auth.uid())
  );

CREATE TRIGGER trg_student_protocols_updated
BEFORE UPDATE ON public.student_protocols
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_exercise_library_updated
BEFORE UPDATE ON public.exercise_library
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
