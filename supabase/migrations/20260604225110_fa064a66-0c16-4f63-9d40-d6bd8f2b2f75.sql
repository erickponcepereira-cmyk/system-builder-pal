DROP POLICY IF EXISTS "Master coaches view all evaluation clients" ON public.coach_evaluation_clients;
CREATE POLICY "Master coaches view all evaluation clients"
ON public.coach_evaluation_clients
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
);

DROP POLICY IF EXISTS "Master coaches update evaluation clients" ON public.coach_evaluation_clients;
CREATE POLICY "Master coaches update evaluation clients"
ON public.coach_evaluation_clients
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
)
WITH CHECK (
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
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
);

DROP POLICY IF EXISTS "Master coaches create body assessments" ON public.coach_body_assessments;
CREATE POLICY "Master coaches create body assessments"
ON public.coach_body_assessments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
  AND EXISTS (
    SELECT 1
    FROM public.coach_evaluation_clients ec
    WHERE ec.id = coach_body_assessments.client_id
      AND ec.coach_id = coach_body_assessments.coach_id
  )
);

DROP POLICY IF EXISTS "Master coaches update body assessments" ON public.coach_body_assessments;
CREATE POLICY "Master coaches update body assessments"
ON public.coach_body_assessments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
  AND EXISTS (
    SELECT 1
    FROM public.coach_evaluation_clients ec
    WHERE ec.id = coach_body_assessments.client_id
      AND ec.coach_id = coach_body_assessments.coach_id
  )
);

DROP POLICY IF EXISTS "Master coaches delete body assessments" ON public.coach_body_assessments;
CREATE POLICY "Master coaches delete body assessments"
ON public.coach_body_assessments
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
);

DROP POLICY IF EXISTS "Master coaches insert deletion logs" ON public.coach_assessment_deletions;
CREATE POLICY "Master coaches insert deletion logs"
ON public.coach_assessment_deletions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
);

DROP POLICY IF EXISTS "Master coaches view deletion logs" ON public.coach_assessment_deletions;
CREATE POLICY "Master coaches view deletion logs"
ON public.coach_assessment_deletions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND public.is_master_coach(c.id)
  )
);