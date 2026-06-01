CREATE POLICY "window_logs_coach_write" ON public.window_method_logs
  FOR ALL USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.coaches c ON c.id = s.coach_id
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  ) WITH CHECK (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.coaches c ON c.id = s.coach_id
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  );