
-- Allow master coaches (have master_coach badge) to view all coach_evaluation_clients and coach_body_assessments
DROP POLICY IF EXISTS "Master coaches view all evaluation clients" ON public.coach_evaluation_clients;
CREATE POLICY "Master coaches view all evaluation clients"
ON public.coach_evaluation_clients
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
);

DROP POLICY IF EXISTS "Master coaches view all body assessments" ON public.coach_body_assessments;
CREATE POLICY "Master coaches view all body assessments"
ON public.coach_body_assessments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
);
