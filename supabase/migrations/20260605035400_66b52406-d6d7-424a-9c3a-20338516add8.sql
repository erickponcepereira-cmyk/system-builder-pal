-- Allow the responsible coach and event_creator badge holders to always read their events,
-- regardless of visibility_roles. Fixes "responsible coach can't see registrations".

DROP POLICY IF EXISTS fitmind_events_read ON public.fitmind_events;

CREATE POLICY fitmind_events_read
ON public.fitmind_events
FOR SELECT
USING (
  is_admin(auth.uid())
  OR public.can_create_fitmind_events(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = fitmind_events.responsible_coach_id
      AND p.user_id = auth.uid()
  )
  OR (
    is_active = true
    AND (
      'todos' = ANY (visibility_roles)
      OR ('coaches' = ANY (visibility_roles) AND EXISTS (
        SELECT 1 FROM public.coaches
        WHERE coaches.profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      ))
      OR ('alunos' = ANY (visibility_roles) AND EXISTS (
        SELECT 1 FROM public.students
        WHERE students.profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
      ))
      OR ('parceiros' = ANY (visibility_roles) AND EXISTS (
        SELECT 1 FROM public.partners
        WHERE partners.profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
          AND partners.status::text = 'active'
      ))
      OR ('profissionais' = ANY (visibility_roles) AND EXISTS (
        SELECT 1 FROM public.coaches c2
        JOIN public.profiles p2 ON p2.id = c2.profile_id
        WHERE p2.user_id = auth.uid()
      ))
    )
  )
);