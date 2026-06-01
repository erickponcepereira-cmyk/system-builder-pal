
CREATE TABLE IF NOT EXISTS public.window_method_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  log_date        date NOT NULL DEFAULT CURRENT_DATE,
  goal            text NOT NULL CHECK (goal IN ('slim', 'mass')),
  meal_1_protein  boolean NOT NULL DEFAULT false,
  meal_1_fiber    boolean NOT NULL DEFAULT false,
  meal_1_carb     boolean NOT NULL DEFAULT false,
  meal_2_protein  boolean NOT NULL DEFAULT false,
  meal_2_fiber    boolean NOT NULL DEFAULT false,
  meal_2_carb     boolean NOT NULL DEFAULT false,
  meal_3_protein  boolean NOT NULL DEFAULT false,
  meal_3_fiber    boolean NOT NULL DEFAULT false,
  meal_3_carb     boolean NOT NULL DEFAULT false,
  meal_4_protein  boolean NOT NULL DEFAULT false,
  meal_4_fiber    boolean NOT NULL DEFAULT false,
  meal_4_carb     boolean NOT NULL DEFAULT false,
  meal_5_protein  boolean NOT NULL DEFAULT false,
  meal_5_fiber    boolean NOT NULL DEFAULT false,
  meal_5_carb     boolean NOT NULL DEFAULT false,
  meal_6_protein  boolean NOT NULL DEFAULT false,
  meal_6_fiber    boolean NOT NULL DEFAULT false,
  meal_6_carb     boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, log_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.window_method_logs TO authenticated;
GRANT ALL ON public.window_method_logs TO service_role;

ALTER TABLE public.window_method_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "window_logs_student_all" ON public.window_method_logs
  FOR ALL USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.profiles p ON p.id = s.profile_id
      WHERE p.user_id = auth.uid()
    )
  ) WITH CHECK (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.profiles p ON p.id = s.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "window_logs_coach_read" ON public.window_method_logs
  FOR SELECT USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.coaches c ON c.id = s.coach_id
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY "window_logs_admin_all" ON public.window_method_logs
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_window_logs_student_date
  ON public.window_method_logs (student_id, log_date DESC);
