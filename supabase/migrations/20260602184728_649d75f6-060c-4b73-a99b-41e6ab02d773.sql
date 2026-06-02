
-- Tokens de desafio: cada moeda concede o direito de entrar em um desafio (mês)
CREATE TABLE public.student_challenge_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  source_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  source_product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  granted_by text NOT NULL DEFAULT 'purchase' CHECK (granted_by IN ('purchase','admin','manual')),
  granted_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  consumed_competition_id uuid REFERENCES public.competitions(id) ON DELETE SET NULL,
  consumed_enrollment_id uuid REFERENCES public.competition_enrollments(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_token_per_transaction
  ON public.student_challenge_tokens(source_transaction_id)
  WHERE source_transaction_id IS NOT NULL;

CREATE INDEX idx_student_tokens_student ON public.student_challenge_tokens(student_id);
CREATE INDEX idx_student_tokens_unused  ON public.student_challenge_tokens(student_id) WHERE consumed_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.student_challenge_tokens TO authenticated;
GRANT ALL ON public.student_challenge_tokens TO service_role;

ALTER TABLE public.student_challenge_tokens ENABLE ROW LEVEL SECURITY;

-- Admin total
CREATE POLICY "tokens_admin_all"
  ON public.student_challenge_tokens
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Aluno vê os próprios
CREATE POLICY "tokens_student_select"
  ON public.student_challenge_tokens FOR SELECT
  USING (student_id IN (
    SELECT s.id FROM students s
    JOIN profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid()
  ));

-- Coach vê os tokens dos próprios alunos
CREATE POLICY "tokens_coach_select"
  ON public.student_challenge_tokens FOR SELECT
  USING (student_id IN (
    SELECT s.id FROM students s
    JOIN coaches c ON c.id = s.coach_id
    JOIN profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  ));

-- Trigger: ao marcar transação como paga, se o produto tem acesso ao desafio, gera 1 token
CREATE OR REPLACE FUNCTION public.grant_challenge_token_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_access boolean;
BEGIN
  IF NEW.status::text = 'paid' AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'paid') THEN
    SELECT COALESCE(has_challenge_access, false) INTO has_access
    FROM public.products WHERE id = NEW.product_id;
    IF has_access THEN
      INSERT INTO public.student_challenge_tokens
        (student_id, source_transaction_id, source_product_id, granted_by)
      VALUES (NEW.student_id, NEW.id, NEW.product_id, 'purchase')
      ON CONFLICT (source_transaction_id) WHERE source_transaction_id IS NOT NULL DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_challenge_token ON public.transactions;
CREATE TRIGGER trg_grant_challenge_token
AFTER INSERT OR UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.grant_challenge_token_on_paid();

-- Backfill para transações já pagas
INSERT INTO public.student_challenge_tokens (student_id, source_transaction_id, source_product_id, granted_by)
SELECT t.student_id, t.id, t.product_id, 'purchase'
FROM public.transactions t
JOIN public.products p ON p.id = t.product_id
WHERE t.status::text = 'paid' AND p.has_challenge_access = true
ON CONFLICT (source_transaction_id) WHERE source_transaction_id IS NOT NULL DO NOTHING;
