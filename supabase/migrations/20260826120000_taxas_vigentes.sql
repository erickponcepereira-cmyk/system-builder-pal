-- ============================================================================
-- PASSO 1 — a fonte unica das taxas, com vigencia por data
--
-- O QUE ISTO FAZ: cria a tabela de vigencia e a funcao que le a taxa valida
-- numa data. NENHUM VALOR MUDA — a linha semente traz exatamente o que ja
-- esta rodando hoje (4,98 / 0,99 / 6 / 5 / 3-2-1).
--
-- O QUE ISTO NAO FAZ: nao altera nenhuma funcao de venda. As seis que tem os
-- numeros cravados continuam iguais ate o Passo 2. Aqui so nasce a fonte.
--
-- POR QUE COM VIGENCIA: a regra do Erick e que cada alteracao de taxa vale
-- dali para frente e o passado nao muda. Com a data na tabela isso deixa de
-- depender de cuidado e passa a ser estrutura: uma venda antiga sempre le a
-- taxa que valia no dia dela.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.taxas_vigentes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vigente_desde     date        NOT NULL UNIQUE,
  maquininha_cartao numeric(6,3) NOT NULL,
  maquininha_pix    numeric(6,3) NOT NULL,
  imposto_pct       numeric(6,3) NOT NULL,
  sistema_pct       numeric(6,3) NOT NULL,
  rede_l1_pct       numeric(6,3) NOT NULL,
  rede_l2_pct       numeric(6,3) NOT NULL,
  rede_l3_pct       numeric(6,3) NOT NULL,
  motivo            text,
  criado_por        uuid REFERENCES public.profiles(id),
  criado_em         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_taxas_vigentes_data
  ON public.taxas_vigentes (vigente_desde DESC);

ALTER TABLE public.taxas_vigentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS taxas_vigentes_leitura ON public.taxas_vigentes;
CREATE POLICY taxas_vigentes_leitura ON public.taxas_vigentes
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.taxas_vigentes TO authenticated;
GRANT ALL    ON public.taxas_vigentes TO service_role;

-- A semente: exatamente o que roda hoje. A data e anterior a primeira venda
-- do sistema, para que nenhuma venda historica fique sem taxa vigente.
INSERT INTO public.taxas_vigentes
  (vigente_desde, maquininha_cartao, maquininha_pix, imposto_pct,
   sistema_pct, rede_l1_pct, rede_l2_pct, rede_l3_pct, motivo)
VALUES
  ('2026-01-01', 4.98, 0.99, 6, 5, 3, 2, 1,
   'Semente: valores que ja estavam cravados nas funcoes de venda em 26/08/2026')
ON CONFLICT (vigente_desde) DO NOTHING;

CREATE OR REPLACE FUNCTION public.taxa_vigente(_data date DEFAULT CURRENT_DATE)
 RETURNS public.taxas_vigentes
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $fn_taxa$
  SELECT t.*
    FROM public.taxas_vigentes t
   WHERE t.vigente_desde <= COALESCE(_data, CURRENT_DATE)
   ORDER BY t.vigente_desde DESC
   LIMIT 1;
$fn_taxa$;

REVOKE ALL ON FUNCTION public.taxa_vigente(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.taxa_vigente(date) TO authenticated, service_role;
