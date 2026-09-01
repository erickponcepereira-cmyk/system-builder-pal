-- ============================================================================
-- As fatias de rede da loja FitMind vão para o padrão novo: 10 / 5 / 3.
--
-- A virada de taxa de 26/08 mudou a rede de 3/2/1 para 10/5/3 em TODO o
-- caminho automático — parceiro, profissional, mensalidade — porque lá o
-- percentual sai de `taxa_vigente()`. A loja FitMind não: cada produto carrega
-- as próprias fatias em `product_value_slots`, escritas à mão, e por isso
-- ficou no valor velho enquanto o resto do sistema já pagava o novo.
--
-- Efeito colateral que some junto: `products.commission_level1` vale 15,00 e a
-- fatia pagava 3. A loja do coach exibe a coluna, então o coach lia 15% e
-- recebia 3%. Com a fatia em 10 e a coluna corrigida, as duas passam a dizer a
-- mesma coisa.
--
-- ESCOPO ESTREITO DE PROPÓSITO: só os 67 produtos cujos TRÊS níveis estão
-- exatamente em 3/2/1. Sete já estão em 10/5/3 e ficam como estão. E cinco têm
-- configuração própria — 5/2.5/0.5, um com L3 zerado, e três a que falta algum
-- nível. Manual vence automático: nenhum deles é tocado aqui.
-- ============================================================================

-- O retrato antes. Escrita em massa em fatia de dinheiro não se faz sem ele.
CREATE TABLE IF NOT EXISTS auditoria.fatias_antes_20260901 AS
  SELECT s.id AS slot_id, s.product_id, s.destination::text AS destino,
         s.value_amount AS valor_antigo, now() AS tirado_em
    FROM public.product_value_slots s
   WHERE false;

WITH tri AS (
  SELECT s.product_id,
         max(s.value_amount) FILTER (WHERE s.destination::text='network_l1') AS l1,
         max(s.value_amount) FILTER (WHERE s.destination::text='network_l2') AS l2,
         max(s.value_amount) FILTER (WHERE s.destination::text='network_l3') AS l3,
         count(*) FILTER (WHERE s.destination::text LIKE 'network_l%') AS niveis
    FROM public.product_value_slots s
    JOIN public.products p ON p.id = s.product_id
   WHERE s.is_active AND p.status = 'active' AND s.value_type = 'pct_running'
   GROUP BY 1
),
alvo AS (
  SELECT product_id FROM tri WHERE l1 = 3 AND l2 = 2 AND l3 = 1 AND niveis = 3
)
INSERT INTO auditoria.fatias_antes_20260901 (slot_id, product_id, destino, valor_antigo, tirado_em)
  SELECT s.id, s.product_id, s.destination::text, s.value_amount, now()
    FROM public.product_value_slots s
   WHERE s.product_id IN (SELECT product_id FROM alvo)
     AND s.is_active
     AND s.destination::text IN ('network_l1', 'network_l2', 'network_l3');

-- E a troca, sobre exatamente o mesmo conjunto.
WITH tri AS (
  SELECT s.product_id,
         max(s.value_amount) FILTER (WHERE s.destination::text='network_l1') AS l1,
         max(s.value_amount) FILTER (WHERE s.destination::text='network_l2') AS l2,
         max(s.value_amount) FILTER (WHERE s.destination::text='network_l3') AS l3,
         count(*) FILTER (WHERE s.destination::text LIKE 'network_l%') AS niveis
    FROM public.product_value_slots s
    JOIN public.products p ON p.id = s.product_id
   WHERE s.is_active AND p.status = 'active' AND s.value_type = 'pct_running'
   GROUP BY 1
),
alvo AS (
  SELECT product_id FROM tri WHERE l1 = 3 AND l2 = 2 AND l3 = 1 AND niveis = 3
)
UPDATE public.product_value_slots s
   SET value_amount = CASE s.destination::text
                        WHEN 'network_l1' THEN 10
                        WHEN 'network_l2' THEN 5
                        WHEN 'network_l3' THEN 3
                      END
 WHERE s.product_id IN (SELECT product_id FROM alvo)
   AND s.is_active
   AND s.destination::text IN ('network_l1', 'network_l2', 'network_l3');

-- A coluna de vitrine passa a dizer a verdade nos mesmos produtos.
UPDATE public.products p
   SET commission_level1 = 10, commission_level2 = 5, commission_level3 = 3
 WHERE p.status = 'active'
   AND EXISTS (
     SELECT 1 FROM public.product_value_slots s
      WHERE s.product_id = p.id AND s.is_active
        AND s.destination::text = 'network_l1' AND s.value_amount = 10
   );
