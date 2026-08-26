-- ============================================================================
-- PASSO 3 — as taxas novas, vigentes a partir de 26/08/2026
--
--   maquininha cartao   4,98%  (inalterada, e o que o Mercado Pago cobra)
--   maquininha pix      0,99%  (inalterada)
--   imposto             6% -> 0%    a reserva fiscal deixa de existir
--   taxa do sistema     5% -> 7%
--   rede L1 / L2 / L3   3/2/1 -> 10/5/3
--
-- O QUE ISSO FAZ COM O DINHEIRO, numa venda de R$ 1.000 no pix com coach a 10%:
--   parceiro/criador   795,74 -> 828,71   (+32,97)
--   sistema             46,53 ->  69,31   (+22,78)
--   rede (L1+L2+L3)      5,30 ->  16,57   (+11,27)
--   coach vendedor      83,12 ->  75,51   (-7,61)
--
-- O coach vendedor perde porque a rede sai da comissao DELE, e ela triplica.
-- Isso foi mostrado e aprovado antes de aplicar: o objetivo e premiar quem
-- constroi rede, e o vendedor direto absorve a diferenca.
--
-- O passado nao muda: cada venda ja gravou seus valores, e a vigencia por data
-- garante que uma consulta pelo dia da venda continue devolvendo 6% de imposto
-- e 5% de sistema para tudo que foi vendido ate 25/08.
-- ============================================================================

INSERT INTO public.taxas_vigentes
  (vigente_desde, maquininha_cartao, maquininha_pix, imposto_pct,
   sistema_pct, rede_l1_pct, rede_l2_pct, rede_l3_pct, motivo)
VALUES
  ('2026-08-26', 4.98, 0.99, 0, 7, 10, 5, 3,
   'Fim da reserva fiscal (imposto 6 -> 0), sistema 5 -> 7, rede padronizada em 10/5/3')
ON CONFLICT (vigente_desde) DO UPDATE
  SET maquininha_cartao = EXCLUDED.maquininha_cartao,
      maquininha_pix    = EXCLUDED.maquininha_pix,
      imposto_pct       = EXCLUDED.imposto_pct,
      sistema_pct       = EXCLUDED.sistema_pct,
      rede_l1_pct       = EXCLUDED.rede_l1_pct,
      rede_l2_pct       = EXCLUDED.rede_l2_pct,
      rede_l3_pct       = EXCLUDED.rede_l3_pct,
      motivo            = EXCLUDED.motivo;

-- ============================================================================
-- E uma correcao que a virada expos: admin_reprocess_partner_order chamava
-- taxa_vigente() sem data, entao reprocessar um pedido antigo aplicaria a taxa
-- de HOJE nele. Isso viola a regra de que o passado nao muda. Passa a usar a
-- data do proprio pedido.
-- ============================================================================

DO $mig_reproc$
DECLARE d text; novo text; n int;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
   WHERE nsp.nspname='public' AND p.proname='admin_reprocess_partner_order';
  IF d IS NULL THEN RAISE EXCEPTION 'funcao nao encontrada'; END IF;

  novo := replace(d, 'public.taxa_vigente()',
                     'public.taxa_vigente(COALESCE(o.paid_at, o.created_at)::date)');
  n := (length(d) - length(replace(d, 'public.taxa_vigente()', ''))) / length('public.taxa_vigente()');

  IF n < 1 THEN RAISE EXCEPTION 'Abortado: nenhuma chamada sem data encontrada.'; END IF;
  IF novo = d THEN RAISE EXCEPTION 'Abortado: corpo nao mudou.'; END IF;

  EXECUTE novo;
  RAISE NOTICE 'admin_reprocess_partner_order -> % chamadas passaram a usar a data do pedido', n;
END
$mig_reproc$;
