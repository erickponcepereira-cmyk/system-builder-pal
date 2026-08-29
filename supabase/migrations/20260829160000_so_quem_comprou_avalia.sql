-- ============================================================================
-- "Só quem comprou avalia" precisa ser verdade, não só uma frase.
--
-- A migration anterior criou `product_reviews` dizendo que a amarra com
-- (order_id, order_type) é o que impede a tabela de virar mural. Mas a RLS
-- garante apenas que o `author_id` é o meu perfil — ela nunca olha se aquele
-- PEDIDO é meu. Com um uuid de pedido alheio, dava para escrever avaliação de
-- compra que nunca aconteceu.
--
-- É o tipo de erro que não aparece em teste nenhum: a tela sempre manda o
-- pedido certo, porque é a tela que preenche o campo. Quem não usa a tela é
-- que passa por cima.
--
-- Este gatilho põe a garantia onde ela sobrevive a qualquer cliente.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.avaliacao_exige_compra_propria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn_avaliacao$
DECLARE
  v_dono uuid;
BEGIN
  -- Admin passa: ele edita moderação e responde, e não é dele o pedido.
  IF EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.user_id = auth.uid() AND p.role = 'admin') THEN
    RETURN NEW;
  END IF;

  -- De quem é o pedido citado, no perfil (não no aluno).
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

DROP TRIGGER IF EXISTS product_reviews_exige_compra ON public.product_reviews;
CREATE TRIGGER product_reviews_exige_compra
  BEFORE INSERT OR UPDATE OF order_id, author_id ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.avaliacao_exige_compra_propria();

COMMENT ON FUNCTION public.avaliacao_exige_compra_propria() IS
  'Recusa avaliacao cujo pedido nao pertence ao autor. A RLS so checa o author_id; sem isto, um uuid de pedido alheio abria a porta para avaliar compra que nunca aconteceu.';
