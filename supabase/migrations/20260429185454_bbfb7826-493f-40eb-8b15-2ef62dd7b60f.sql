CREATE TABLE public.coach_evaluation_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'other',
  ethnicity TEXT NOT NULL DEFAULT 'other',
  height NUMERIC,
  height_unit TEXT NOT NULL DEFAULT 'cm',
  birth_date DATE,
  language TEXT NOT NULL DEFAULT 'pt',
  whatsapp TEXT,
  email TEXT,
  notes TEXT,
  groups TEXT[] NOT NULL DEFAULT '{}',
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.coach_body_assessments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.coach_evaluation_clients(id) ON DELETE CASCADE,
  coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  assessment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  method TEXT NOT NULL DEFAULT 'bioimpedance',
  age INTEGER,
  height NUMERIC,
  weight NUMERIC,
  bmi NUMERIC,
  body_fat NUMERIC,
  skeletal_muscle NUMERIC,
  muscle_mass NUMERIC,
  visceral_fat NUMERIC,
  basal_metabolism NUMERIC,
  body_age INTEGER,
  body_water NUMERIC,
  bone_mass NUMERIC,
  segment_analysis JSONB NOT NULL DEFAULT '{}'::jsonb,
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  heart_rate INTEGER,
  blood_glucose NUMERIC,
  client_notes TEXT,
  professional_notes TEXT,
  photos JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_assessment_date DATE,
  next_assessment_time TIME,
  group_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_evaluation_clients_coach_id ON public.coach_evaluation_clients(coach_id);
CREATE INDEX idx_coach_evaluation_clients_name ON public.coach_evaluation_clients(name);
CREATE INDEX idx_coach_body_assessments_client_id ON public.coach_body_assessments(client_id);
CREATE INDEX idx_coach_body_assessments_coach_id ON public.coach_body_assessments(coach_id);
CREATE INDEX idx_coach_body_assessments_date ON public.coach_body_assessments(assessment_date DESC);

ALTER TABLE public.coach_evaluation_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_body_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all evaluation clients"
ON public.coach_evaluation_clients
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Coaches can view own evaluation clients"
ON public.coach_evaluation_clients
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_evaluation_clients.coach_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Coaches can create own evaluation clients"
ON public.coach_evaluation_clients
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_evaluation_clients.coach_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Coaches can update own evaluation clients"
ON public.coach_evaluation_clients
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_evaluation_clients.coach_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_evaluation_clients.coach_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all body assessments"
ON public.coach_body_assessments
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Coaches can view own body assessments"
ON public.coach_body_assessments
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_body_assessments.coach_id
      AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Coaches can create own body assessments"
ON public.coach_body_assessments
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_body_assessments.coach_id
      AND p.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.coach_evaluation_clients ec
    WHERE ec.id = coach_body_assessments.client_id
      AND ec.coach_id = coach_body_assessments.coach_id
  )
);

CREATE POLICY "Coaches can update own body assessments"
ON public.coach_body_assessments
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_body_assessments.coach_id
      AND p.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = coach_body_assessments.coach_id
      AND p.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.coach_evaluation_clients ec
    WHERE ec.id = coach_body_assessments.client_id
      AND ec.coach_id = coach_body_assessments.coach_id
  )
);

CREATE TRIGGER update_coach_evaluation_clients_updated_at
BEFORE UPDATE ON public.coach_evaluation_clients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_coach_body_assessments_updated_at
BEFORE UPDATE ON public.coach_body_assessments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();