-- ============================================================================
-- Quatro fatias apontando para `custom`, e a rede que faltava em seis produtos.
--
-- O `custom` e uma armadilha silenciosa: a string 'custom' NAO APARECE uma
-- unica vez dentro de `process_paid_transaction`. Mas o motor faz
-- `total_distributed := total_distributed + slot_amount` ANTES de decidir o
-- destino. Entao o valor sai do bolo distribuivel e nao vira registro para
-- ninguem — nem comissao, nem carteira, nem pool. Simplesmente evapora.
--
-- Nenhum dos quatro produtos teve venda paga ainda. A armadilha estava armada
-- e nunca disparou. Se tivesse disparado, teria custado por venda:
--
--   Tri-Core Protein Blend Chocolate   R$ 306,24 fixo — 66% de um produto de 467
--   Herbal Concentrate Laranja         25%, ~R$ 91,00
--   Herbal Concentrate Original 102g    3%, ~R$ 10,92
--   Whey Protein 3W Baunilha            2%, ~R$  5,12
--
-- O rotulo de cada uma diz sem ambiguidade o que ela deveria ser, e e por isso
-- que da para consertar sem adivinhar: "Aluno" e indicacao, "Upline 1" e a
-- primeira linha da rede, e a fatia fixa de nome igual ao do produto, em
-- slot_order 0, e o custo — exatamente o padrao de todos os outros produtos.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auditoria.fatias_custom_antes_20260901 AS
  SELECT s.id AS slot_id, s.product_id, p.name AS produto, s.label,
         s.destination::text AS destino_antigo, s.value_type, s.value_amount,
         now() AS tirado_em
    FROM public.product_value_slots s
    JOIN public.products p ON p.id = s.product_id
   WHERE s.is_active AND p.status = 'active' AND s.destination::text = 'custom';

UPDATE public.product_value_slots s
   SET destination = 'referral_student'::public.value_destination_type,
       destination_label = 'Aluno indicador'
  FROM public.products p
 WHERE p.id = s.product_id AND s.is_active
   AND s.destination::text = 'custom' AND s.label ~* '^alun';

UPDATE public.product_value_slots s
   SET destination = 'network_l1'::public.value_destination_type,
       destination_label = 'Upline nível 1'
  FROM public.products p
 WHERE p.id = s.product_id AND s.is_active
   AND s.destination::text = 'custom' AND s.label ~* 'upline\s*1|linha\s*1';

UPDATE public.product_value_slots s
   SET destination = 'network_l2'::public.value_destination_type,
       destination_label = 'Upline nível 2'
  FROM public.products p
 WHERE p.id = s.product_id AND s.is_active
   AND s.destination::text = 'custom' AND s.label ~* 'upline\s*2|linha\s*2';

-- A fatia fixa em slot_order 0 com o nome do produto e custo, como em todos os
-- outros. Restrita a `fixed` para nao pegar percentual por engano.
UPDATE public.product_value_slots s
   SET destination = 'product_order_pool'::public.value_destination_type,
       destination_label = 'Painel de Pedidos (custos)'
  FROM public.products p
 WHERE p.id = s.product_id AND s.is_active
   AND s.destination::text = 'custom'
   AND s.value_type = 'fixed' AND s.slot_order = 0;

-- ----------------------------------------------------------------------------
-- A rede dos seis produtos que ficaram fora da virada de 10/5/3.
--
-- Quatro ja tem as tres fatias (algumas so agora, depois do conserto acima) e
-- so precisam do valor. Dois nao tem fatia de rede NENHUMA e ganham as tres.
-- ----------------------------------------------------------------------------
UPDATE public.product_value_slots s
   SET value_amount = CASE s.destination::text
                        WHEN 'network_l1' THEN 10
                        WHEN 'network_l2' THEN 5
                        WHEN 'network_l3' THEN 3
                      END
  FROM public.products p
 WHERE p.id = s.product_id AND s.is_active AND p.status = 'active'
   AND s.destination::text IN ('network_l1', 'network_l2', 'network_l3')
   AND s.value_type = 'pct_running'
   AND btrim(p.name) IN (
     'Herbal Concentrate Original 102g',
     'Whey Protein 3W Sabor Baunilha 510g',
     'Sopa Snack Proteica Frango com Legumes 196g',
     'Mentoria Coach Terapia Relacionamento'
   );

-- Os dois sem rede nenhuma. As tres fatias compartilham `slot_group` porque e
-- isso que faz as tres lerem a MESMA base congelada em vez do saldo corrente —
-- sem o grupo, a linha 2 calcularia sobre o que sobrou depois da linha 1.
INSERT INTO public.product_value_slots
  (product_id, slot_order, label, value_type, value_amount, destination,
   destination_label, slot_group, is_active, applies_to_referral_sales, is_system_fee)
SELECT p.id, o.ordem, o.rotulo, 'pct_running', o.valor,
       o.destino::public.value_destination_type, o.rotulo_destino, 1, true, true, false
  FROM public.products p
 CROSS JOIN (VALUES
    (0, 'Linha 1', 10::numeric, 'network_l1', 'Upline nível 1'),
    (1, 'Linha 2',  5::numeric, 'network_l2', 'Upline nível 2'),
    (2, 'Linha 3',  3::numeric, 'network_l3', 'Upline nível 3')
 ) AS o(ordem, rotulo, valor, destino, rotulo_destino)
 WHERE p.status = 'active'
   AND btrim(p.name) IN ('Sérum Facial Redutor de linhas 30 ml', 'Shape Control')
   AND NOT EXISTS (
     SELECT 1 FROM public.product_value_slots x
      WHERE x.product_id = p.id AND x.is_active
        AND x.destination::text LIKE 'network_l%'
   );

-- A coluna de vitrine acompanha, onde a fatia confirma.
UPDATE public.products p
   SET commission_level1 = 10, commission_level2 = 5, commission_level3 = 3
 WHERE p.status = 'active'
   AND EXISTS (SELECT 1 FROM public.product_value_slots s
                WHERE s.product_id = p.id AND s.is_active
                  AND s.destination::text = 'network_l1' AND s.value_amount = 10);
