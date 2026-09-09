-- Maquininha nova: cartão 4,98% -> 2,99% e PIX 0,99% -> 0,60%.
--
-- Vigência 09/09/2026 por decisão do Erick: corte à meia-noite, para nenhuma
-- venda de 08/09 ficar com a régua misturada. As demais colunas repetem a
-- vigência de 26/08 sem alteração — a linha é um retrato completo, não um
-- patch, e omitir uma coluna aqui seria zerá-la.
INSERT INTO public.taxas_vigentes (
  vigente_desde, maquininha_cartao, maquininha_pix,
  imposto_pct, sistema_pct, rede_l1_pct, rede_l2_pct, rede_l3_pct, motivo
)
SELECT DATE '2026-09-09', 2.99, 0.60,
       t.imposto_pct, t.sistema_pct, t.rede_l1_pct, t.rede_l2_pct, t.rede_l3_pct,
       'Maquininha renegociada: cartao 4,98 -> 2,99 e pix 0,99 -> 0,60'
  FROM public.taxa_vigente(DATE '2026-09-08') t
 WHERE NOT EXISTS (
   SELECT 1 FROM public.taxas_vigentes WHERE vigente_desde = DATE '2026-09-09'
 );
