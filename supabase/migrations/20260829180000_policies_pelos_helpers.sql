-- ============================================================================
-- Minhas policies de hoje violavam duas regras do proprio repositorio.
--
-- A CLAUDE.md diz, e diz por causa de um incidente real:
--
--   "Toda policy precisa de `TO` explicito. Sem ele o Postgres aplica a
--    PUBLIC, incluindo `anon`."
--   "Nunca consulte `profiles` de dentro de uma policy — use `is_admin()`.
--    Um revoke em `partners` derrubou o login de todos os parceiros em
--    22/08/2026."
--
-- A policy de UPDATE de `return_requests` que escrevi hoje saiu SEM `TO`:
-- valia para PUBLIC, `anon` incluso. E as seis de `product_reviews` faziam
-- `SELECT ... FROM profiles` inline — o mesmo padrao que derrubou o login dos
-- parceiros, porque amarra a policy a permissao de leitura de outra tabela.
--
-- `current_profile_id()` e `is_admin()` ja existem, as duas SECURITY DEFINER,
-- justamente para isso. Passam a ser usadas.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- return_requests
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "requester can cancel own returns" ON public.return_requests;
CREATE POLICY "requester can cancel own returns"
  ON public.return_requests
  FOR UPDATE
  TO authenticated
  USING (requested_by = public.current_profile_id()
         AND status IN ('requested', 'under_review'))
  WITH CHECK (requested_by = public.current_profile_id()
              AND status = 'cancelled');

-- ----------------------------------------------------------------------------
-- product_reviews
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "avaliacao visivel para todos" ON public.product_reviews;
CREATE POLICY "avaliacao visivel para todos"
  ON public.product_reviews FOR SELECT TO authenticated
  USING (hidden_at IS NULL);

DROP POLICY IF EXISTS "autor ve a propria avaliacao" ON public.product_reviews;
CREATE POLICY "autor ve a propria avaliacao"
  ON public.product_reviews FOR SELECT TO authenticated
  USING (author_id = public.current_profile_id());

DROP POLICY IF EXISTS "autor escreve a propria avaliacao" ON public.product_reviews;
CREATE POLICY "autor escreve a propria avaliacao"
  ON public.product_reviews FOR INSERT TO authenticated
  WITH CHECK (author_id = public.current_profile_id());

DROP POLICY IF EXISTS "autor corrige a propria avaliacao" ON public.product_reviews;
CREATE POLICY "autor corrige a propria avaliacao"
  ON public.product_reviews FOR UPDATE TO authenticated
  USING (author_id = public.current_profile_id() AND hidden_at IS NULL)
  WITH CHECK (author_id = public.current_profile_id() AND hidden_at IS NULL);

DROP POLICY IF EXISTS "autor apaga a propria avaliacao" ON public.product_reviews;
CREATE POLICY "autor apaga a propria avaliacao"
  ON public.product_reviews FOR DELETE TO authenticated
  USING (author_id = public.current_profile_id());

DROP POLICY IF EXISTS "admin cuida das avaliacoes" ON public.product_reviews;
CREATE POLICY "admin cuida das avaliacoes"
  ON public.product_reviews FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- O gatilho tambem consultava profiles direto. Mesma troca.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.avaliacao_exige_compra_propria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn_avaliacao$
DECLARE
  v_dono uuid;
BEGIN
  -- Admin passa: ele modera e responde, e o pedido nao e dele.
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  SELECT s.profile_id INTO v_dono
    FROM public.store_orders o
    JOIN public.students s ON s.id = o.student_id
   WHERE o.id = NEW.order_id;

  IF v_dono IS NULL THEN
    SELECT s.profile_id INTO v_dono
      FROM public.partner_product_orders o
      JOIN public.students s ON s.id = o.student_id
     WHERE o.id = NEW.order_id;
  END IF;

  IF v_dono IS NULL THEN
    RAISE EXCEPTION 'Pedido nao encontrado: so da para avaliar uma compra que existe.';
  END IF;

  IF v_dono IS DISTINCT FROM NEW.author_id THEN
    RAISE EXCEPTION 'Esta compra nao e sua: so quem comprou avalia.';
  END IF;

  RETURN NEW;
END
$fn_avaliacao$;
