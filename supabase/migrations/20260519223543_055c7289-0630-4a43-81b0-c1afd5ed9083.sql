
CREATE TABLE public.coach_network_projections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  vendas_coach INTEGER NOT NULL DEFAULT 1,
  tree JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coach_id, product_id)
);

ALTER TABLE public.coach_network_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Coach manages own projections"
ON public.coach_network_projections
FOR ALL
TO authenticated
USING (
  coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Admin views all projections"
ON public.coach_network_projections
FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
);

CREATE TRIGGER update_coach_network_projections_updated_at
BEFORE UPDATE ON public.coach_network_projections
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
