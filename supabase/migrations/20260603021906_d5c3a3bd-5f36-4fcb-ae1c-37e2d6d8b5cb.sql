-- Track first-time achievement date of each patent per coach
CREATE TABLE public.coach_patent_achievements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL,
  patent_key TEXT NOT NULL,
  patent_level INTEGER NOT NULL DEFAULT 0,
  achieved_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  qualifying_revenue NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (coach_id, patent_key)
);

GRANT SELECT ON public.coach_patent_achievements TO authenticated;
GRANT ALL ON public.coach_patent_achievements TO service_role;

ALTER TABLE public.coach_patent_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach can view own patent achievements"
ON public.coach_patent_achievements
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_patent_achievements.coach_id
      AND p.user_id = auth.uid()
  )
);

CREATE INDEX idx_coach_patent_achievements_coach ON public.coach_patent_achievements(coach_id);
