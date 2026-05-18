CREATE TABLE public.coach_assessment_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.coach_evaluation_clients(id) ON DELETE SET NULL,
  client_name text,
  assessment_id uuid,
  assessment_date timestamptz,
  reason text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assessment_deletions_coach ON public.coach_assessment_deletions(coach_id);
CREATE INDEX idx_assessment_deletions_created ON public.coach_assessment_deletions(created_at DESC);

ALTER TABLE public.coach_assessment_deletions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coaches can insert their own deletion logs"
ON public.coach_assessment_deletions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Coaches can view their own deletion logs"
ON public.coach_assessment_deletions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all deletion logs"
ON public.coach_assessment_deletions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);