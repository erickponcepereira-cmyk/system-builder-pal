
-- 1) Add weight to evaluation clients so nutri can capture full intake
ALTER TABLE public.coach_evaluation_clients
  ADD COLUMN IF NOT EXISTS current_weight numeric(5,2);

-- 2) Anamnese answers for external (nutri-managed) clients
CREATE TABLE IF NOT EXISTS public.professional_anamnesis_external (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  evaluation_client_id uuid NOT NULL REFERENCES public.coach_evaluation_clients(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (coach_id, evaluation_client_id)
);
ALTER TABLE public.professional_anamnesis_external ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pae_owner_all ON public.professional_anamnesis_external;
CREATE POLICY pae_owner_all ON public.professional_anamnesis_external
  FOR ALL TO authenticated
  USING (coach_id = public.current_coach_id())
  WITH CHECK (coach_id = public.current_coach_id());
DROP POLICY IF EXISTS pae_admin_all ON public.professional_anamnesis_external;
CREATE POLICY pae_admin_all ON public.professional_anamnesis_external
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_pae_updated_at BEFORE UPDATE ON public.professional_anamnesis_external
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Custom anamnesis questions per professional
CREATE TABLE IF NOT EXISTS public.professional_anamnesis_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  label text NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  position integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_paq_coach ON public.professional_anamnesis_questions(coach_id, position);
ALTER TABLE public.professional_anamnesis_questions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS paq_owner_all ON public.professional_anamnesis_questions;
CREATE POLICY paq_owner_all ON public.professional_anamnesis_questions
  FOR ALL TO authenticated
  USING (coach_id = public.current_coach_id())
  WITH CHECK (coach_id = public.current_coach_id());
DROP POLICY IF EXISTS paq_admin_all ON public.professional_anamnesis_questions;
CREATE POLICY paq_admin_all ON public.professional_anamnesis_questions
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE TRIGGER trg_paq_updated_at BEFORE UPDATE ON public.professional_anamnesis_questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Public profile page for the professional (visible from store)
CREATE TABLE IF NOT EXISTS public.professional_public_profile (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  headline text,
  bio_long text,
  instagram text,
  website text,
  social_links jsonb NOT NULL DEFAULT '[]'::jsonb,
  services text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.professional_public_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppp_owner_all ON public.professional_public_profile;
CREATE POLICY ppp_owner_all ON public.professional_public_profile
  FOR ALL TO authenticated
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());
DROP POLICY IF EXISTS ppp_admin_all ON public.professional_public_profile;
CREATE POLICY ppp_admin_all ON public.professional_public_profile
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS ppp_public_select ON public.professional_public_profile;
CREATE POLICY ppp_public_select ON public.professional_public_profile
  FOR SELECT TO anon, authenticated USING (
    EXISTS (
      SELECT 1 FROM public.coaches c
      WHERE c.profile_id = professional_public_profile.profile_id
        AND c.is_professional = true
        AND c.approved_at IS NOT NULL
    )
  );
CREATE TRIGGER trg_ppp_updated_at BEFORE UPDATE ON public.professional_public_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
