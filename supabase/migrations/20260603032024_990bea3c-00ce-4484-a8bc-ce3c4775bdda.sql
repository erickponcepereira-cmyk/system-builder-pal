-- 1) Extend anamnesis_forms with structured medical fields (non-confidential)
ALTER TABLE public.anamnesis_forms
  ADD COLUMN IF NOT EXISTS blood_type text,
  ADD COLUMN IF NOT EXISTS food_intolerances text,
  ADD COLUMN IF NOT EXISTS has_diabetes boolean,
  ADD COLUMN IF NOT EXISTS has_hypertension boolean,
  ADD COLUMN IF NOT EXISTS has_cardiopathy boolean,
  ADD COLUMN IF NOT EXISTS other_chronic_conditions text;

-- 2) Confidential medical notes table — only admin and the author professional can see
CREATE TABLE IF NOT EXISTS public.student_medical_confidential_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smcn_student ON public.student_medical_confidential_notes(student_id);
CREATE INDEX IF NOT EXISTS idx_smcn_author ON public.student_medical_confidential_notes(author_profile_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_medical_confidential_notes TO authenticated;
GRANT ALL ON public.student_medical_confidential_notes TO service_role;

ALTER TABLE public.student_medical_confidential_notes ENABLE ROW LEVEL SECURITY;

-- Admins (and only admins among non-authors) can see/manage everything
CREATE POLICY "smcn_admin_all" ON public.student_medical_confidential_notes
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- The author professional can see and manage their own notes
CREATE POLICY "smcn_author_all" ON public.student_medical_confidential_notes
  FOR ALL TO authenticated
  USING (author_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ))
  WITH CHECK (author_profile_id IN (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  ));

-- NOTE: intentionally NO policy for students or coaches; sigilosas são invisíveis a eles.

CREATE TRIGGER trg_smcn_updated_at
  BEFORE UPDATE ON public.student_medical_confidential_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
