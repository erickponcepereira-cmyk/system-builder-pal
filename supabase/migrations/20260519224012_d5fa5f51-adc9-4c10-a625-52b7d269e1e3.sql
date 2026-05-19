
-- 1. Enum de medalhas
DO $$ BEGIN
  CREATE TYPE public.coach_badge_key AS ENUM (
    'master_coach',
    'coach_hbl_42',
    'coach_hbl_50',
    'nutritionist_partner',
    'council'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tabela de medalhas atribuídas
CREATE TABLE IF NOT EXISTS public.coach_badges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  badge_key public.coach_badge_key NOT NULL,
  granted_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(coach_id, badge_key)
);

ALTER TABLE public.coach_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view badges"
ON public.coach_badges FOR SELECT TO authenticated USING (true);

CREATE POLICY "Only admin can insert badges"
ON public.coach_badges FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admin can delete badges"
ON public.coach_badges FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Only admin can update badges"
ON public.coach_badges FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- 3. Flags em produtos
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS required_badge public.coach_badge_key,
  ADD COLUMN IF NOT EXISTS allow_master_coach_sale BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_for_council BOOLEAN NOT NULL DEFAULT false;

-- 4. Função utilitária
CREATE OR REPLACE FUNCTION public.has_coach_badge(_coach_id UUID, _badge public.coach_badge_key)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_badges
    WHERE coach_id = _coach_id AND badge_key = _badge
  );
$$;
