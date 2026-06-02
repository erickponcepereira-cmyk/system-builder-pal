
-- Tabela de tentativas/erros do fluxo de entrada no desafio via moeda
CREATE TABLE public.challenge_token_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  user_id uuid,
  success boolean NOT NULL,
  error_code text,
  error_message text,
  competition_id uuid,
  group_id uuid,
  token_id uuid,
  enrollment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_challenge_token_attempts_student ON public.challenge_token_attempts(student_id, created_at DESC);
CREATE INDEX idx_challenge_token_attempts_created ON public.challenge_token_attempts(created_at DESC);
CREATE INDEX idx_challenge_token_attempts_failed ON public.challenge_token_attempts(created_at DESC) WHERE success = false;

GRANT SELECT, INSERT ON public.challenge_token_attempts TO authenticated;
GRANT ALL ON public.challenge_token_attempts TO service_role;

ALTER TABLE public.challenge_token_attempts ENABLE ROW LEVEL SECURITY;

-- Admin vê tudo
CREATE POLICY "attempts_admin_all" ON public.challenge_token_attempts
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Aluno vê as próprias
CREATE POLICY "attempts_student_own" ON public.challenge_token_attempts
  FOR SELECT TO authenticated USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.profiles p ON p.id = s.profile_id
      WHERE p.user_id = auth.uid()
    )
  );
