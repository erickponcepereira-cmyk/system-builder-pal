-- Uma definição só de "venda própria do coach" (VP).
--
-- Por que existe: o painel de carreira do coach tinha TRÊS contas diferentes
-- para a mesma coisa, e por isso três números na mesma tela:
--
--   * medalhas  (coach-medals.functions.ts)  — transações dos alunos
--                                            + partner_product_orders por selling_coach_id
--   * patentes  (coach-career.functions.ts)  — o mesmo, MAIS store_orders,
--                                            MAIS pedido por student_id,
--                                            MAIS professional_coach_id e partner_id
--                                            (ou seja, produto criado entrava)
--   * ranking   (network-ranking.functions.ts) — transações dos alunos
--                                            + partner_product_orders por student_id
--
-- A regra do negócio é: só venda própria como coach. Não conta produto criado,
-- não conta master coach, não conta rede. Contar `professional_coach_id` e
-- `partner_id` premiava quem apenas cadastrou o produto — e contradizia o
-- comentário que já existia no módulo de medalhas dizendo exatamente isso.
--
-- `transactions` não tem quem vendeu (só o aluno), então para a loja FitMind a
-- única atribuição possível é pelo aluno do coach. Para produto de
-- parceiro/profissional existe `selling_coach_id`, que é quem fez a venda — e é
-- esse que vale.
CREATE OR REPLACE FUNCTION public.coach_vp_no_periodo(
  _desde timestamptz DEFAULT NULL,
  _ate   timestamptz DEFAULT NULL
)
RETURNS TABLE (coach_id uuid, vp numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH lim AS (
    SELECT COALESCE(_desde, '-infinity'::timestamptz) AS desde,
           COALESCE(_ate,   'infinity'::timestamptz)  AS ate
  ),
  -- store_order que já entrou como transaction não pode ser contado de novo.
  ligadas AS (
    SELECT DISTINCT (t.metadata->>'store_order_id') AS order_id
      FROM public.transactions t
     WHERE t.metadata->>'store_order_id' IS NOT NULL
  ),
  tx AS (
    SELECT s.coach_id, SUM(t.gross_amount) AS valor
      FROM public.transactions t
      JOIN public.students s ON s.id = t.student_id
      CROSS JOIN lim
     WHERE t.status = 'paid' AND t.paid_at IS NOT NULL
       AND t.paid_at >= lim.desde AND t.paid_at <= lim.ate
       AND COALESCE(t.is_test, false) = false
       AND COALESCE(s.is_test, false) = false
     GROUP BY 1
  ),
  so AS (
    SELECT s.coach_id, SUM(o.total_amount) AS valor
      FROM public.store_orders o
      JOIN public.students s ON s.id = o.student_id
      CROSS JOIN lim
     WHERE o.status = 'paid' AND o.paid_at IS NOT NULL
       AND o.paid_at >= lim.desde AND o.paid_at <= lim.ate
       AND COALESCE(o.is_test, false) = false
       AND COALESCE(s.is_test, false) = false
       AND NOT EXISTS (SELECT 1 FROM ligadas l WHERE l.order_id = o.id::text)
     GROUP BY 1
  ),
  ppo AS (
    -- Quem VENDEU. Dono do produto não entra.
    SELECT o.selling_coach_id AS coach_id, SUM(o.gross_amount) AS valor
      FROM public.partner_product_orders o
      CROSS JOIN lim
     WHERE o.status = 'paid' AND o.paid_at IS NOT NULL
       AND o.paid_at >= lim.desde AND o.paid_at <= lim.ate
       AND COALESCE(o.is_test, false) = false
       AND o.selling_coach_id IS NOT NULL
     GROUP BY 1
  )
  SELECT c.id,
         ROUND(COALESCE(tx.valor,0) + COALESCE(so.valor,0) + COALESCE(ppo.valor,0), 2)
    FROM public.coaches c
    LEFT JOIN tx  ON tx.coach_id  = c.id
    LEFT JOIN so  ON so.coach_id  = c.id
    LEFT JOIN ppo ON ppo.coach_id = c.id
   WHERE COALESCE(c.is_test, false) = false;
$fn$;

-- Venda de equipe (VE): a soma do VP de todo o downline, em qualquer
-- profundidade. Recursiva de propósito — o cálculo anterior montava a árvore no
-- servidor de aplicação e refazia isso a cada janela de tempo.
CREATE OR REPLACE FUNCTION public.coach_ve_no_periodo(
  _desde timestamptz DEFAULT NULL,
  _ate   timestamptz DEFAULT NULL
)
RETURNS TABLE (coach_id uuid, ve numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH RECURSIVE vp AS (
    SELECT * FROM public.coach_vp_no_periodo(_desde, _ate)
  ),
  rede AS (
    SELECT c.id AS raiz, c.id AS descendente FROM public.coaches c
    UNION ALL
    SELECT r.raiz, c.id
      FROM rede r
      JOIN public.coaches c ON c.upline_coach_id = r.descendente
  )
  SELECT r.raiz, ROUND(COALESCE(SUM(vp.vp), 0), 2)
    FROM rede r
    LEFT JOIN vp ON vp.coach_id = r.descendente
   WHERE r.descendente <> r.raiz
   GROUP BY r.raiz;
$fn$;

REVOKE ALL ON FUNCTION public.coach_vp_no_periodo(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.coach_ve_no_periodo(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_vp_no_periodo(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.coach_ve_no_periodo(timestamptz, timestamptz) TO authenticated;
