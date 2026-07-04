
CREATE TABLE public.terms_acceptances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term_type TEXT NOT NULL CHECK (term_type IN ('aluno','coach','parceiro','profissional','desafio')),
  term_version TEXT NOT NULL,
  content_hash TEXT,
  ip_address TEXT,
  user_agent TEXT,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_terms_acceptances_user ON public.terms_acceptances(user_id);
CREATE INDEX idx_terms_acceptances_type_version ON public.terms_acceptances(term_type, term_version);
CREATE INDEX idx_terms_acceptances_accepted_at ON public.terms_acceptances(accepted_at DESC);

GRANT SELECT, INSERT ON public.terms_acceptances TO authenticated;
GRANT ALL ON public.terms_acceptances TO service_role;

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own acceptances"
  ON public.terms_acceptances FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all acceptances"
  ON public.terms_acceptances FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Users insert own acceptance"
  ON public.terms_acceptances FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
