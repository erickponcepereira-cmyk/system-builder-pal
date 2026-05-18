
CREATE TABLE IF NOT EXISTS public.workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  goal TEXT NOT NULL DEFAULT 'general' CHECK (goal IN ('hypertrophy','adaptation','weight_loss','general','other')),
  level TEXT CHECK (level IN ('iniciante','intermediario','avancado') OR level IS NULL),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_global BOOLEAN NOT NULL DEFAULT false,
  created_by_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workout_templates_goal ON public.workout_templates(goal);
CREATE INDEX IF NOT EXISTS idx_workout_templates_coach ON public.workout_templates(created_by_coach_id);

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View global or own templates"
ON public.workout_templates FOR SELECT
TO authenticated
USING (
  is_global = true
  OR public.is_admin(auth.uid())
  OR created_by_coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Insert own templates"
ON public.workout_templates FOR INSERT
TO authenticated
WITH CHECK (
  public.is_admin(auth.uid())
  OR (
    is_global = false
    AND created_by_coach_id IN (
      SELECT c.id FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Update own templates"
ON public.workout_templates FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    is_global = false
    AND created_by_coach_id IN (
      SELECT c.id FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Delete own templates"
ON public.workout_templates FOR DELETE
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    is_global = false
    AND created_by_coach_id IN (
      SELECT c.id FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  )
);

CREATE TRIGGER update_workout_templates_updated_at
BEFORE UPDATE ON public.workout_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
