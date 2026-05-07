
-- Coach editable monthly goals
CREATE TABLE IF NOT EXISTS public.coach_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  reference_month DATE NOT NULL DEFAULT date_trunc('month', CURRENT_DATE)::DATE,
  new_students INTEGER NOT NULL DEFAULT 15,
  renewals INTEGER NOT NULL DEFAULT 18,
  prospections INTEGER NOT NULL DEFAULT 50,
  revenue NUMERIC NOT NULL DEFAULT 6000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, reference_month)
);

ALTER TABLE public.coach_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_goals_select ON public.coach_goals;
CREATE POLICY coach_goals_select ON public.coach_goals FOR SELECT
USING (
  public.is_admin(auth.uid())
  OR coach_id = public.current_coach_id()
);

DROP POLICY IF EXISTS coach_goals_modify ON public.coach_goals;
CREATE POLICY coach_goals_modify ON public.coach_goals FOR ALL
USING (
  public.is_admin(auth.uid())
  OR coach_id = public.current_coach_id()
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR coach_id = public.current_coach_id()
);

CREATE TRIGGER coach_goals_touch BEFORE UPDATE ON public.coach_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
