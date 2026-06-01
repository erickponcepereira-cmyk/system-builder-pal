-- Allow coaches to read weight_logs of their direct students
CREATE POLICY "weight_logs_coach_select"
ON public.weight_logs
FOR SELECT
TO authenticated
USING (
  student_id IN (
    SELECT s.id
    FROM public.students s
    JOIN public.coaches c ON c.id = s.coach_id
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);

-- Allow coaches to read evolution_photos of their direct students (respecting student-set visibility)
CREATE POLICY "evolution_photos_coach_select"
ON public.evolution_photos
FOR SELECT
TO authenticated
USING (
  COALESCE(is_visible_to_coach, true) = true
  AND student_id IN (
    SELECT s.id
    FROM public.students s
    JOIN public.coaches c ON c.id = s.coach_id
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);