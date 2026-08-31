-- Caixa da academia: fluxo de caixa, custos, baixas, retirada e fechamento.
--
-- A regra que desenha tudo: O DINHEIRO QUE ENTRA JA ESTA GRAVADO. Mensalidade,
-- day-use e inscricao de evento tem valor, forma de pagamento, taxa e liquido
-- desde 13/08. Recadastrar venda no caixa seria a sexta duplicacao do projeto e,
-- pior, criaria dois numeros de faturamento que discordam entre si.
--
-- Entao o caixa NAO guarda venda. Ele LE as tres tabelas de venda e acrescenta
-- so o que faltava: saida, retirada, aporte, transferencia e o marco de
-- fechamento. Quatro tabelas novas, nenhuma tabela existente alterada.
--
-- Conferido antes de criar, com information_schema: nao existe nenhuma tabela
-- com 'caixa', 'despesa', 'custo' ou 'lancamento' no nome. `transactions` e
-- `wallets` sao o financeiro do marketplace (compra de aluno, carteira de
-- perfil) e nao servem: nao tem partner_id de academia nem competencia.

-- =====================================================================
-- 1. Onde o dinheiro fica
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.academia_caixa_contas (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  nome             text NOT NULL,
  tipo             text NOT NULL DEFAULT 'dinheiro',
  saldo_inicial    numeric(12,2) NOT NULL DEFAULT 0,
  formas_pagamento text[] NOT NULL DEFAULT '{}',
  ativo            boolean NOT NULL DEFAULT true,
  posicao          smallint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_caixa_conta_tipo_valido
    CHECK (tipo IN ('dinheiro','banco','maquininha','outro')),
  CONSTRAINT academia_caixa_conta_nome_unico UNIQUE (partner_id, nome)
);

CREATE INDEX IF NOT EXISTS academia_caixa_contas_por_partner
  ON public.academia_caixa_contas (partner_id, posicao);

COMMENT ON COLUMN public.academia_caixa_contas.formas_pagamento IS
  'Quais formas de pagamento caem nesta conta. E o unico elo entre a venda e a conta: a venda nao tem conta_id, entao o pix vai para o banco e o dinheiro vai para a gaveta por esta lista. Forma que nao casa com nenhuma conta cai na conta ativa de menor posicao — dinheiro nenhum some.';

-- =====================================================================
-- 2. Categorias (o donut de "despesas por categoria" nao existe sem elas)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.academia_caixa_categorias (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  nome       text NOT NULL,
  tipo       text NOT NULL DEFAULT 'saida',
  cor        text NOT NULL DEFAULT '#94a3b8',
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_caixa_categoria_tipo_valido CHECK (tipo IN ('saida','entrada')),
  CONSTRAINT academia_caixa_categoria_nome_unico UNIQUE (partner_id, tipo, nome)
);

CREATE INDEX IF NOT EXISTS academia_caixa_categorias_por_partner
  ON public.academia_caixa_categorias (partner_id, tipo);

-- =====================================================================
-- 3. Lancamentos: SO o que nao vem das vendas
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.academia_caixa_lancamentos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id       uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  conta_id         uuid NOT NULL REFERENCES public.academia_caixa_contas(id) ON DELETE RESTRICT,
  tipo             text NOT NULL,
  categoria_id     uuid REFERENCES public.academia_caixa_categorias(id) ON DELETE SET NULL,
  descricao        text NOT NULL,
  valor            numeric(12,2) NOT NULL,
  competencia      date NOT NULL,
  pago             boolean NOT NULL DEFAULT true,
  pago_em          date,
  conta_destino_id uuid REFERENCES public.academia_caixa_contas(id) ON DELETE RESTRICT,
  observacao       text,
  criado_por       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_caixa_lancamento_tipo_valido
    CHECK (tipo IN ('saida','entrada','retirada','aporte','transferencia')),
  CONSTRAINT academia_caixa_lancamento_valor_positivo CHECK (valor > 0),
  CONSTRAINT academia_caixa_transferencia_tem_destino CHECK (
    (tipo = 'transferencia' AND conta_destino_id IS NOT NULL AND conta_destino_id <> conta_id)
    OR (tipo <> 'transferencia' AND conta_destino_id IS NULL)
  ),
  CONSTRAINT academia_caixa_pago_em_coerente CHECK (pago OR pago_em IS NULL)
);

CREATE INDEX IF NOT EXISTS academia_caixa_lancamentos_por_competencia
  ON public.academia_caixa_lancamentos (partner_id, competencia);

CREATE INDEX IF NOT EXISTS academia_caixa_lancamentos_por_conta
  ON public.academia_caixa_lancamentos (conta_id);

CREATE INDEX IF NOT EXISTS academia_caixa_lancamentos_pendentes
  ON public.academia_caixa_lancamentos (partner_id, competencia) WHERE NOT pago;

COMMENT ON TABLE public.academia_caixa_lancamentos IS
  'O que o caixa acrescenta as vendas: saida, entrada avulsa, retirada do dono, aporte e transferencia entre contas. Venda de mensalidade, day-use e evento NAO entram aqui — sao lidas das proprias tabelas por academia_caixa_vendas().';

COMMENT ON COLUMN public.academia_caixa_lancamentos.pago IS
  'Dar baixa e marcar pago = true. Existe separado de competencia porque a conta de luz de agosto que ainda nao foi paga precisa aparecer no mes de agosto E na lista de pendencias — sao duas perguntas diferentes sobre a mesma linha.';

COMMENT ON COLUMN public.academia_caixa_lancamentos.competencia IS
  'A que dia o lancamento pertence no relatorio. E date, nao timestamptz, de proposito: o dono escolhe o dia, entao nao ha fuso para converter.';

-- =====================================================================
-- 4. Fechamento: o "zerar caixa"
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.academia_caixa_fechamentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id    uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  conta_id      uuid NOT NULL REFERENCES public.academia_caixa_contas(id) ON DELETE CASCADE,
  ate           date NOT NULL,
  saldo_apurado numeric(12,2) NOT NULL,
  observacao    text,
  fechado_por   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_caixa_fechamento_unico UNIQUE (conta_id, ate)
);

CREATE INDEX IF NOT EXISTS academia_caixa_fechamentos_por_conta
  ON public.academia_caixa_fechamentos (partner_id, conta_id, ate DESC);

COMMENT ON TABLE public.academia_caixa_fechamentos IS
  'Zerar o caixa NAO apaga nada. Grava um marco: ate este dia o saldo era este. O saldo passa a ser contado a partir dele. Apagar historico para zerar destruiria a unica prova do que aconteceu — o filtro pedido e exatamente este marco.';

-- =====================================================================
-- 5. RLS. Toda policy com TO authenticated EXPLICITO.
--    Sem TO o Postgres aplica a PUBLIC, que inclui anon — foi assim que
--    413 credenciais vazaram em 28/08.
-- =====================================================================

ALTER TABLE public.academia_caixa_contas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_caixa_categorias   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_caixa_lancamentos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academia_caixa_fechamentos  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_caixa_contas_acesso      ON public.academia_caixa_contas;
DROP POLICY IF EXISTS academia_caixa_categorias_acesso  ON public.academia_caixa_categorias;
DROP POLICY IF EXISTS academia_caixa_lancamentos_acesso ON public.academia_caixa_lancamentos;
DROP POLICY IF EXISTS academia_caixa_fechamentos_acesso ON public.academia_caixa_fechamentos;

CREATE POLICY academia_caixa_contas_acesso ON public.academia_caixa_contas
  FOR ALL TO authenticated
  USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

CREATE POLICY academia_caixa_categorias_acesso ON public.academia_caixa_categorias
  FOR ALL TO authenticated
  USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

CREATE POLICY academia_caixa_lancamentos_acesso ON public.academia_caixa_lancamentos
  FOR ALL TO authenticated
  USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

CREATE POLICY academia_caixa_fechamentos_acesso ON public.academia_caixa_fechamentos
  FOR ALL TO authenticated
  USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- =====================================================================
-- 6. De que conta e cada venda
--
-- A venda nao tem conta_id e nao vou alterar tres tabelas de producao para
-- por uma. O elo e a forma de pagamento. Regra em UMA funcao: se estivesse
-- copiada em extrato, saldo e fechamento, um dia as tres discordariam.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.academia_caixa_conta_da_forma(
  p_partner_id uuid,
  p_forma      text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT c.id
    FROM public.academia_caixa_contas c
   WHERE c.partner_id = p_partner_id
     AND c.ativo
   ORDER BY (c.formas_pagamento @> ARRAY[COALESCE(p_forma, '')]) DESC,
            c.posicao,
            c.nome
   LIMIT 1;
$function$;

-- =====================================================================
-- 7. As vendas, num formato so
--
-- Esta funcao concentra as tres armadilhas que ja custaram caro. Se ela
-- estivesse repetida dentro de resumo, extrato, por_dia e saldo_contas,
-- seriam quatro lugares para errar:
--
--   1. importado_de IS NOT NULL veio da planilha do sistema antigo. NAO e
--      dinheiro que entrou. Sao 404 das 420 linhas da Estacao; conta-las
--      fazia o relatorio mostrar 418 lancamentos onde havia 14.
--   2. O banco roda em UTC. Data do usuario e sempre AT TIME ZONE com o
--      timezone da propria academia. Nunca ::date cru em timestamptz.
--   3. Somar o cabecalho da mensalidade E as linhas de pagamento contaria a
--      mesma venda duas vezes: hoje elas sao 1:1. Le-se as partes, e o
--      cabecalho so quando nao ha parte nenhuma (venda anterior a 25/08).
-- =====================================================================

CREATE OR REPLACE FUNCTION public.academia_caixa_vendas(
  p_partner_id uuid,
  p_de         date,
  p_ate        date
)
RETURNS TABLE(
  fonte           text,
  fonte_id        uuid,
  data_local      date,
  descricao       text,
  forma_pagamento text,
  bruto           numeric,
  taxa            numeric,
  liquido         numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
#variable_conflict use_column
DECLARE
  v_tz text;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');

  RETURN QUERY
  SELECT 'mensalidade'::text, m.id,
         (m.created_at AT TIME ZONE v_tz)::date,
         m.plano,
         pg.forma_pagamento,
         pg.valor, pg.taxa_valor, pg.valor_liquido
    FROM public.academia_mensalidades m
    JOIN public.academia_mensalidade_pagamentos pg ON pg.mensalidade_id = m.id
   WHERE m.partner_id = p_partner_id
     AND m.status = 'ativa'
     AND m.importado_de IS NULL
     AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN p_de AND p_ate

  UNION ALL

  SELECT 'mensalidade'::text, m.id,
         (m.created_at AT TIME ZONE v_tz)::date,
         m.plano,
         m.forma_pagamento,
         m.valor, m.taxa_valor, m.valor_liquido
    FROM public.academia_mensalidades m
   WHERE m.partner_id = p_partner_id
     AND m.status = 'ativa'
     AND m.importado_de IS NULL
     AND m.valor > 0
     AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN p_de AND p_ate
     AND NOT EXISTS (
       SELECT 1 FROM public.academia_mensalidade_pagamentos pg
        WHERE pg.mensalidade_id = m.id
     )

  UNION ALL

  SELECT 'dayuse'::text, d.id,
         (d.created_at AT TIME ZONE v_tz)::date,
         COALESCE(d.tipo, 'Day-use'),
         d.forma_pagamento,
         d.valor, d.taxa_valor, d.valor_liquido
    FROM public.academia_dayuse d
   WHERE d.partner_id = p_partner_id
     AND d.valor > 0
     AND (d.created_at AT TIME ZONE v_tz)::date BETWEEN p_de AND p_ate

  UNION ALL

  SELECT 'evento'::text, i.id,
         (i.created_at AT TIME ZONE v_tz)::date,
         COALESCE(e.nome, 'Evento'),
         i.forma_pagamento,
         i.valor, i.taxa_valor, i.valor_liquido
    FROM public.academia_evento_inscricoes i
    LEFT JOIN public.academia_eventos e ON e.id = i.evento_id
   WHERE i.partner_id = p_partner_id
     AND i.valor > 0
     AND (i.created_at AT TIME ZONE v_tz)::date BETWEEN p_de AND p_ate;
END;
$function$;

COMMENT ON FUNCTION public.academia_caixa_vendas(uuid, date, date) IS
  'As tres fontes de receita da academia num formato so. E a unica leitura de venda do caixa: filtra importacao, converte fuso e nunca conta a mesma venda duas vezes.';

-- =====================================================================
-- 8. Resumo do periodo — o cabecalho Entrada / Saldo / Saida
--
-- Duas reguas diferentes, de proposito:
--   saldo  = tudo que entrou menos tudo que saiu, incluindo aporte e
--            retirada. E quanto dinheiro se mexeu.
--   lucro  = receita liquida das vendas + entradas avulsas - despesas.
--            Aporte e retirada NAO entram: por dinheiro do bolso do dono
--            no lucro do mes inventa lucro que nao existe, e tirar o
--            pro-labore como se fosse custo conta o mesmo dinheiro duas
--            vezes. Sao movimento de capital, nao resultado.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.academia_caixa_resumo(
  p_partner_id uuid,
  p_de         date DEFAULT NULL,
  p_ate        date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz    text;
  v_hoje  date;
  v_de    date;
  v_ate   date;
  v_out   jsonb;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;
  v_tz   := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_de   := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate  := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);

  WITH vendas AS (
    SELECT * FROM public.academia_caixa_vendas(p_partner_id, v_de, v_ate)
  ),
  lanc AS (
    SELECT l.tipo, l.valor, l.pago, l.competencia
      FROM public.academia_caixa_lancamentos l
     WHERE l.partner_id = p_partner_id
       AND l.competencia BETWEEN v_de AND v_ate
       AND l.tipo <> 'transferencia'
  ),
  atraso AS (
    SELECT l.valor
      FROM public.academia_caixa_lancamentos l
     WHERE l.partner_id = p_partner_id
       AND NOT l.pago
       AND l.tipo IN ('saida','retirada')
       AND l.competencia <= v_hoje
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object(
      'de', v_de, 'ate', v_ate, 'hoje', v_hoje, 'timezone', v_tz
    ),

    'vendas', (
      SELECT jsonb_build_object(
        'quantidade', count(*),
        'bruto',   COALESCE(sum(v.bruto), 0),
        'taxas',   COALESCE(sum(v.taxa), 0),
        'liquido', COALESCE(sum(v.liquido), 0),
        'mensalidades', COALESCE(sum(v.bruto) FILTER (WHERE v.fonte = 'mensalidade'), 0),
        'dayuse',       COALESCE(sum(v.bruto) FILTER (WHERE v.fonte = 'dayuse'), 0),
        'eventos',      COALESCE(sum(v.bruto) FILTER (WHERE v.fonte = 'evento'), 0)
      ) FROM vendas v
    ),

    'entradas', jsonb_build_object(
      'vendas',      (SELECT COALESCE(sum(v.liquido), 0) FROM vendas v),
      'avulsas',     (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo = 'entrada' AND l.pago), 0) FROM lanc l),
      'aportes',     (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo = 'aporte' AND l.pago), 0) FROM lanc l),
      'total',       (SELECT COALESCE(sum(v.liquido), 0) FROM vendas v)
                     + (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('entrada','aporte') AND l.pago), 0) FROM lanc l)
    ),

    'saidas', jsonb_build_object(
      'despesas',  (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo = 'saida' AND l.pago), 0) FROM lanc l),
      'retiradas', (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo = 'retirada' AND l.pago), 0) FROM lanc l),
      'total',     (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('saida','retirada') AND l.pago), 0) FROM lanc l)
    ),

    'saldo',
      (SELECT COALESCE(sum(v.liquido), 0) FROM vendas v)
      + (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('entrada','aporte') AND l.pago), 0) FROM lanc l)
      - (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('saida','retirada') AND l.pago), 0) FROM lanc l),

    'lucro',
      (SELECT COALESCE(sum(v.liquido), 0) FROM vendas v)
      + (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo = 'entrada' AND l.pago), 0) FROM lanc l)
      - (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo = 'saida' AND l.pago), 0) FROM lanc l),

    'realizado', jsonb_build_object(
      'entradas', (SELECT COALESCE(sum(v.liquido), 0) FROM vendas v)
                  + (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('entrada','aporte') AND l.pago), 0) FROM lanc l),
      'saidas',   (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('saida','retirada') AND l.pago), 0) FROM lanc l)
    ),

    'previsto', jsonb_build_object(
      'entradas', (SELECT COALESCE(sum(v.liquido), 0) FROM vendas v)
                  + (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('entrada','aporte')), 0) FROM lanc l),
      'saidas',   (SELECT COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('saida','retirada')), 0) FROM lanc l)
    ),

    'pendentes', (
      SELECT jsonb_build_object(
        'quantidade', count(*) FILTER (WHERE NOT l.pago),
        'saidas',     COALESCE(sum(l.valor) FILTER (WHERE NOT l.pago AND l.tipo IN ('saida','retirada')), 0),
        'entradas',   COALESCE(sum(l.valor) FILTER (WHERE NOT l.pago AND l.tipo IN ('entrada','aporte')), 0),
        'total',      COALESCE(sum(l.valor) FILTER (WHERE NOT l.pago), 0)
      ) FROM lanc l
    ),

    'vencidas', (
      SELECT jsonb_build_object(
        'quantidade', count(*),
        'total', COALESCE(sum(a.valor), 0)
      ) FROM atraso a
    )
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.academia_caixa_resumo(uuid, date, date) IS
  'Cabecalho do caixa. "vencidas" ignora o periodo de proposito: conta de julho que continua sem baixa e pendencia hoje, nao pendencia de julho.';

-- =====================================================================
-- 9. Despesas por categoria — o donut
-- =====================================================================

CREATE OR REPLACE FUNCTION public.academia_caixa_por_categoria(
  p_partner_id uuid,
  p_de         date DEFAULT NULL,
  p_ate        date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz   text;
  v_hoje date;
  v_de   date;
  v_ate  date;
  v_out  jsonb;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;
  v_tz   := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_de   := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate  := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);

  WITH base AS (
    SELECT CASE WHEN l.tipo IN ('saida','retirada') THEN 'saida' ELSE 'entrada' END AS lado,
           l.categoria_id,
           COALESCE(cat.nome, 'Sem categoria') AS nome,
           COALESCE(cat.cor, '#94a3b8')        AS cor,
           l.valor,
           l.pago
      FROM public.academia_caixa_lancamentos l
      LEFT JOIN public.academia_caixa_categorias cat ON cat.id = l.categoria_id
     WHERE l.partner_id = p_partner_id
       AND l.competencia BETWEEN v_de AND v_ate
       AND l.tipo <> 'transferencia'
  ),
  agrupado AS (
    SELECT b.lado, b.categoria_id, b.nome, b.cor,
           count(*)                                        AS quantidade,
           sum(b.valor)                                    AS total,
           COALESCE(sum(b.valor) FILTER (WHERE b.pago), 0) AS pago,
           COALESCE(sum(b.valor) FILTER (WHERE NOT b.pago), 0) AS pendente
      FROM base b
     GROUP BY b.lado, b.categoria_id, b.nome, b.cor
  ),
  totais AS (
    SELECT lado, sum(total) AS total_lado FROM agrupado GROUP BY lado
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('de', v_de, 'ate', v_ate),
    'saida', jsonb_build_object(
      'total', COALESCE((SELECT total_lado FROM totais WHERE lado = 'saida'), 0),
      'itens', COALESCE((
        SELECT jsonb_agg(x ORDER BY (x->>'total')::numeric DESC)
          FROM (
            SELECT jsonb_build_object(
                     'categoria_id', a.categoria_id,
                     'nome', a.nome,
                     'cor', a.cor,
                     'quantidade', a.quantidade,
                     'total', a.total,
                     'pago', a.pago,
                     'pendente', a.pendente,
                     'percentual', round(100 * a.total / NULLIF(t.total_lado, 0), 2)
                   ) AS x
              FROM agrupado a JOIN totais t ON t.lado = a.lado
             WHERE a.lado = 'saida'
          ) s
      ), '[]'::jsonb)
    ),
    'entrada', jsonb_build_object(
      'total', COALESCE((SELECT total_lado FROM totais WHERE lado = 'entrada'), 0),
      'itens', COALESCE((
        SELECT jsonb_agg(x ORDER BY (x->>'total')::numeric DESC)
          FROM (
            SELECT jsonb_build_object(
                     'categoria_id', a.categoria_id,
                     'nome', a.nome,
                     'cor', a.cor,
                     'quantidade', a.quantidade,
                     'total', a.total,
                     'pago', a.pago,
                     'pendente', a.pendente,
                     'percentual', round(100 * a.total / NULLIF(t.total_lado, 0), 2)
                   ) AS x
              FROM agrupado a JOIN totais t ON t.lado = a.lado
             WHERE a.lado = 'entrada'
          ) s
      ), '[]'::jsonb)
    )
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

-- =====================================================================
-- 10. Extrato: vendas e lancamentos na mesma lista, cada linha dizendo
--     de onde veio
-- =====================================================================

CREATE OR REPLACE FUNCTION public.academia_caixa_extrato(
  p_partner_id uuid,
  p_de         date DEFAULT NULL,
  p_ate        date DEFAULT NULL,
  p_conta_id   uuid DEFAULT NULL,
  p_limite     integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz     text;
  v_hoje   date;
  v_de     date;
  v_ate    date;
  v_limite integer;
  v_out    jsonb;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;
  v_tz     := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje   := (now() AT TIME ZONE v_tz)::date;
  v_de     := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate    := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);
  v_limite := LEAST(GREATEST(COALESCE(p_limite, 100), 1), 500);

  WITH venda AS (
    SELECT v.fonte_id                                                  AS id,
           'venda'::text                                               AS origem,
           v.fonte,
           v.data_local                                                AS data,
           v.descricao,
           v.forma_pagamento,
           public.academia_caixa_conta_da_forma(p_partner_id, v.forma_pagamento) AS conta_id,
           NULL::uuid                                                  AS categoria_id,
           'entrada'::text                                             AS direcao,
           v.bruto, v.taxa, v.liquido,
           true                                                        AS pago,
           v.data_local                                                AS pago_em
      FROM public.academia_caixa_vendas(p_partner_id, v_de, v_ate) v
  ),
  lancamento AS (
    SELECT l.id,
           'lancamento'::text AS origem,
           l.tipo             AS fonte,
           l.competencia      AS data,
           l.descricao,
           NULL::text         AS forma_pagamento,
           CASE WHEN l.tipo = 'transferencia' AND p_conta_id = l.conta_destino_id
                THEN l.conta_destino_id ELSE l.conta_id END AS conta_id,
           l.categoria_id,
           CASE
             WHEN l.tipo IN ('entrada','aporte') THEN 'entrada'
             WHEN l.tipo = 'transferencia' AND p_conta_id = l.conta_destino_id THEN 'entrada'
             WHEN l.tipo = 'transferencia' AND p_conta_id IS NULL THEN 'transferencia'
             ELSE 'saida'
           END AS direcao,
           l.valor AS bruto,
           0::numeric AS taxa,
           l.valor AS liquido,
           l.pago,
           l.pago_em
      FROM public.academia_caixa_lancamentos l
     WHERE l.partner_id = p_partner_id
       AND l.competencia BETWEEN v_de AND v_ate
       AND (p_conta_id IS NULL
            OR l.conta_id = p_conta_id
            OR l.conta_destino_id = p_conta_id)
  ),
  tudo AS (
    SELECT * FROM venda
    UNION ALL
    SELECT * FROM lancamento
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'data') DESC, x->>'descricao'), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT jsonb_build_object(
               'id', t.id,
               'origem', t.origem,
               'fonte', t.fonte,
               'data', t.data,
               'descricao', t.descricao,
               'forma_pagamento', t.forma_pagamento,
               'conta_id', t.conta_id,
               'conta_nome', co.nome,
               'categoria_id', t.categoria_id,
               'categoria_nome', cat.nome,
               'categoria_cor', cat.cor,
               'direcao', t.direcao,
               'bruto', t.bruto,
               'taxa', t.taxa,
               'liquido', t.liquido,
               'pago', t.pago,
               'pago_em', t.pago_em
             ) AS x
        FROM tudo t
        LEFT JOIN public.academia_caixa_contas co ON co.id = t.conta_id
        LEFT JOIN public.academia_caixa_categorias cat ON cat.id = t.categoria_id
       WHERE p_conta_id IS NULL OR t.conta_id = p_conta_id
       ORDER BY t.data DESC, t.descricao
       LIMIT v_limite
    ) s;

  RETURN v_out;
END;
$function$;

COMMENT ON FUNCTION public.academia_caixa_extrato(uuid, date, date, uuid, integer) IS
  'Lista unica de movimentos. origem = venda | lancamento; fonte diz qual venda ou qual tipo de lancamento. Transferencia sem filtro de conta vem com direcao = transferencia: e neutra, nao soma nem subtrai do periodo.';

-- =====================================================================
-- 11. Saldo por conta, respeitando o ultimo fechamento
--
-- O saldo da conta usa o LIQUIDO da venda, nao o bruto: o que o banco
-- recebeu da maquininha ja veio com a taxa descontada. E conta so
-- lancamento com baixa — saldo e dinheiro que existe, nao promessa.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.academia_caixa_saldo_contas(
  p_partner_id uuid,
  p_ate        date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz  text;
  v_ate date;
  v_out jsonb;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;
  v_tz  := COALESCE(v_tz, 'America/Sao_Paulo');
  v_ate := COALESCE(p_ate, (now() AT TIME ZONE v_tz)::date);

  WITH marco AS (
    SELECT f.conta_id, max(f.ate) AS ate
      FROM public.academia_caixa_fechamentos f
     WHERE f.partner_id = p_partner_id AND f.ate <= v_ate
     GROUP BY f.conta_id
  ),
  base AS (
    SELECT c.id, c.nome, c.tipo, c.posicao, c.saldo_inicial, c.formas_pagamento,
           m.ate AS fechado_ate,
           COALESCE(fe.saldo_apurado, c.saldo_inicial) AS partida,
           COALESCE(m.ate, DATE '1900-01-01')          AS desde
      FROM public.academia_caixa_contas c
      LEFT JOIN marco m ON m.conta_id = c.id
      LEFT JOIN public.academia_caixa_fechamentos fe
             ON fe.conta_id = c.id AND fe.ate = m.ate
     WHERE c.partner_id = p_partner_id AND c.ativo
  ),
  venda AS (
    SELECT public.academia_caixa_conta_da_forma(p_partner_id, v.forma_pagamento) AS conta_id,
           v.data_local,
           v.liquido
      FROM public.academia_caixa_vendas(p_partner_id, DATE '1900-01-01', v_ate) v
  ),
  mov AS (
    SELECT l.conta_id,
           COALESCE(l.pago_em, l.competencia) AS quando,
           CASE WHEN l.tipo IN ('entrada','aporte') THEN l.valor ELSE -l.valor END AS delta
      FROM public.academia_caixa_lancamentos l
     WHERE l.partner_id = p_partner_id AND l.pago
    UNION ALL
    SELECT l.conta_destino_id,
           COALESCE(l.pago_em, l.competencia),
           l.valor
      FROM public.academia_caixa_lancamentos l
     WHERE l.partner_id = p_partner_id AND l.pago AND l.tipo = 'transferencia'
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'posicao')::int, x->>'nome'), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT jsonb_build_object(
               'conta_id', b.id,
               'nome', b.nome,
               'tipo', b.tipo,
               'posicao', b.posicao,
               'formas_pagamento', to_jsonb(b.formas_pagamento),
               'saldo_inicial', b.saldo_inicial,
               'fechado_ate', b.fechado_ate,
               'partida', b.partida,
               'entradas', COALESCE(ve.total, 0) + COALESCE(mv.entradas, 0),
               'saidas', COALESCE(mv.saidas, 0),
               'saldo', b.partida + COALESCE(ve.total, 0) + COALESCE(mv.entradas, 0) - COALESCE(mv.saidas, 0)
             ) AS x
        FROM base b
        LEFT JOIN LATERAL (
          SELECT COALESCE(sum(v.liquido), 0) AS total
            FROM venda v
           WHERE v.conta_id = b.id AND v.data_local > b.desde AND v.data_local <= v_ate
        ) ve ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(sum(m.delta) FILTER (WHERE m.delta > 0), 0)  AS entradas,
                 COALESCE(-sum(m.delta) FILTER (WHERE m.delta < 0), 0) AS saidas
            FROM mov m
           WHERE m.conta_id = b.id AND m.quando > b.desde AND m.quando <= v_ate
        ) mv ON true
    ) s;

  RETURN v_out;
END;
$function$;

-- =====================================================================
-- 12. Grafico de fluxo, dia a dia
--
-- generate_series para o grafico nao ter buraco: dia sem movimento e
-- zero, nao ausencia de ponto.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.academia_caixa_por_dia(
  p_partner_id uuid,
  p_de         date DEFAULT NULL,
  p_ate        date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz   text;
  v_hoje date;
  v_de   date;
  v_ate  date;
  v_out  jsonb;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;
  v_tz   := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_de   := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate  := COALESCE(p_ate, (date_trunc('month', v_hoje) + interval '1 month - 1 day')::date);

  WITH dias AS (
    SELECT d::date AS data FROM generate_series(v_de, v_ate, interval '1 day') d
  ),
  venda AS (
    SELECT v.data_local AS data, sum(v.liquido) AS total
      FROM public.academia_caixa_vendas(p_partner_id, v_de, v_ate) v
     GROUP BY v.data_local
  ),
  lanc AS (
    SELECT l.competencia AS data,
           COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('entrada','aporte') AND l.pago), 0) AS entradas,
           COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('saida','retirada') AND l.pago), 0) AS saidas,
           COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('entrada','aporte')), 0) AS prev_entradas,
           COALESCE(sum(l.valor) FILTER (WHERE l.tipo IN ('saida','retirada')), 0) AS prev_saidas
      FROM public.academia_caixa_lancamentos l
     WHERE l.partner_id = p_partner_id
       AND l.competencia BETWEEN v_de AND v_ate
       AND l.tipo <> 'transferencia'
     GROUP BY l.competencia
  ),
  linha AS (
    SELECT d.data,
           COALESCE(ve.total, 0) + COALESCE(la.entradas, 0)      AS entradas,
           COALESCE(la.saidas, 0)                                AS saidas,
           COALESCE(ve.total, 0) + COALESCE(la.prev_entradas, 0) AS previsto_entradas,
           COALESCE(la.prev_saidas, 0)                           AS previsto_saidas
      FROM dias d
      LEFT JOIN venda ve ON ve.data = d.data
      LEFT JOIN lanc  la ON la.data = d.data
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'data')), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT jsonb_build_object(
               'data', l.data,
               'entradas', l.entradas,
               'saidas', l.saidas,
               'saldo', l.entradas - l.saidas,
               'acumulado', sum(l.entradas - l.saidas) OVER (ORDER BY l.data),
               'previsto_entradas', l.previsto_entradas,
               'previsto_saidas', l.previsto_saidas
             ) AS x
        FROM linha l
    ) s;

  RETURN v_out;
END;
$function$;

-- =====================================================================
-- 13. Escrita: lancar
-- =====================================================================

CREATE OR REPLACE FUNCTION public.academia_caixa_lancar(
  p_partner_id       uuid,
  p_conta_id         uuid,
  p_tipo             text,
  p_valor            numeric,
  p_descricao        text,
  p_competencia      date DEFAULT NULL,
  p_categoria_id     uuid DEFAULT NULL,
  p_pago             boolean DEFAULT true,
  p_pago_em          date DEFAULT NULL,
  p_conta_destino_id uuid DEFAULT NULL,
  p_observacao       text DEFAULT NULL,
  p_criado_por       uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz          text;
  v_hoje        date;
  v_competencia date;
  v_pago_em     date;
  v_efetiva     date;
  v_linha       public.academia_caixa_lancamentos;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia';
  END IF;

  IF p_tipo NOT IN ('saida','entrada','retirada','aporte','transferencia') THEN
    RAISE EXCEPTION 'Tipo de lancamento invalido: %', p_tipo;
  END IF;

  IF COALESCE(p_valor, 0) <= 0 THEN
    RAISE EXCEPTION 'Valor precisa ser maior que zero';
  END IF;

  IF COALESCE(btrim(p_descricao), '') = '' THEN
    RAISE EXCEPTION 'Descricao e obrigatoria';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.academia_caixa_contas c
     WHERE c.id = p_conta_id AND c.partner_id = p_partner_id
  ) THEN
    RAISE EXCEPTION 'Conta nao pertence a esta academia';
  END IF;

  IF p_tipo = 'transferencia' THEN
    IF p_conta_destino_id IS NULL OR p_conta_destino_id = p_conta_id THEN
      RAISE EXCEPTION 'Transferencia precisa de uma conta de destino diferente';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.academia_caixa_contas c
       WHERE c.id = p_conta_destino_id AND c.partner_id = p_partner_id
    ) THEN
      RAISE EXCEPTION 'Conta de destino nao pertence a esta academia';
    END IF;
  ELSIF p_conta_destino_id IS NOT NULL THEN
    RAISE EXCEPTION 'So transferencia tem conta de destino';
  END IF;

  IF p_categoria_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.academia_caixa_categorias cat
     WHERE cat.id = p_categoria_id AND cat.partner_id = p_partner_id
  ) THEN
    RAISE EXCEPTION 'Categoria nao pertence a esta academia';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;
  v_tz   := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  v_competencia := COALESCE(p_competencia, v_hoje);
  v_pago_em     := CASE WHEN p_pago THEN COALESCE(p_pago_em, v_competencia) ELSE NULL END;

  -- Periodo fechado nao aceita lancamento novo.
  --
  -- O saldo da conta parte do saldo_apurado do fechamento e so soma o que
  -- veio DEPOIS dele. Um lancamento datado antes do marco nao entra na
  -- soma, e tambem nao estava no apurado — ele simplesmente sumiria. Numa
  -- transferencia o estrago e pior: sai de uma conta e nao chega na outra.
  -- Custou R$ 100 num teste desta migration para aparecer.
  v_efetiva := COALESCE(v_pago_em, v_competencia);

  IF EXISTS (
    SELECT 1 FROM public.academia_caixa_fechamentos f
     WHERE f.conta_id IN (p_conta_id, p_conta_destino_id)
       AND f.ate >= v_efetiva
  ) THEN
    RAISE EXCEPTION 'Periodo ja fechado: % cairia antes ou no dia do fechamento desta conta', v_efetiva;
  END IF;

  INSERT INTO public.academia_caixa_lancamentos (
    partner_id, conta_id, tipo, categoria_id, descricao, valor,
    competencia, pago, pago_em, conta_destino_id, observacao, criado_por
  ) VALUES (
    p_partner_id, p_conta_id, p_tipo, p_categoria_id, btrim(p_descricao),
    round(p_valor, 2), v_competencia, p_pago, v_pago_em,
    p_conta_destino_id, NULLIF(btrim(COALESCE(p_observacao, '')), ''), p_criado_por
  )
  RETURNING * INTO v_linha;

  RETURN to_jsonb(v_linha);
END;
$function$;

-- =====================================================================
-- 14. Escrita: dar baixa (e desfazer)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.academia_caixa_baixar(
  p_partner_id     uuid,
  p_lancamento_id  uuid,
  p_pago           boolean DEFAULT true,
  p_pago_em        date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz    text;
  v_hoje  date;
  v_novo  date;
  v_linha public.academia_caixa_lancamentos;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;
  v_tz   := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  SELECT * INTO v_linha
    FROM public.academia_caixa_lancamentos l
   WHERE l.id = p_lancamento_id
     AND l.partner_id = p_partner_id;

  IF v_linha.id IS NULL THEN
    RAISE EXCEPTION 'Lancamento nao encontrado nesta academia';
  END IF;

  v_novo := CASE WHEN p_pago THEN COALESCE(p_pago_em, v_linha.pago_em, v_hoje) ELSE NULL END;

  -- Mesma regra do lancar: a baixa move o dinheiro para a data de pagamento,
  -- e essa data nao pode cair dentro de um periodo ja fechado.
  IF EXISTS (
    SELECT 1 FROM public.academia_caixa_fechamentos f
     WHERE f.conta_id IN (v_linha.conta_id, v_linha.conta_destino_id)
       AND f.ate >= COALESCE(v_novo, v_linha.competencia)
  ) THEN
    RAISE EXCEPTION 'Periodo ja fechado: a baixa cairia antes ou no dia do fechamento desta conta';
  END IF;

  UPDATE public.academia_caixa_lancamentos l
     SET pago    = p_pago,
         pago_em = v_novo
   WHERE l.id = p_lancamento_id
     AND l.partner_id = p_partner_id
  RETURNING * INTO v_linha;

  RETURN to_jsonb(v_linha);
END;
$function$;

-- =====================================================================
-- 15. Escrita: fechar (o "zerar caixa")
--
-- Nao apaga uma linha sequer. Grava o saldo apurado ate a data e move o
-- ponto de partida dos relatorios. Refechar a mesma data recalcula.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.academia_caixa_fechar(
  p_partner_id  uuid,
  p_conta_id    uuid,
  p_ate         date DEFAULT NULL,
  p_observacao  text DEFAULT NULL,
  p_fechado_por uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz     text;
  v_ate    date;
  v_saldo  numeric;
  v_linha  public.academia_caixa_fechamentos;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.academia_caixa_contas c
     WHERE c.id = p_conta_id AND c.partner_id = p_partner_id
  ) THEN
    RAISE EXCEPTION 'Conta nao pertence a esta academia';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;
  v_tz  := COALESCE(v_tz, 'America/Sao_Paulo');
  v_ate := COALESCE(p_ate, (now() AT TIME ZONE v_tz)::date);

  SELECT (x->>'saldo')::numeric INTO v_saldo
    FROM jsonb_array_elements(public.academia_caixa_saldo_contas(p_partner_id, v_ate)) x
   WHERE (x->>'conta_id')::uuid = p_conta_id;

  INSERT INTO public.academia_caixa_fechamentos (
    partner_id, conta_id, ate, saldo_apurado, observacao, fechado_por
  ) VALUES (
    p_partner_id, p_conta_id, v_ate, COALESCE(v_saldo, 0),
    NULLIF(btrim(COALESCE(p_observacao, '')), ''), p_fechado_por
  )
  ON CONFLICT (conta_id, ate) DO UPDATE
     SET saldo_apurado = EXCLUDED.saldo_apurado,
         observacao    = EXCLUDED.observacao,
         fechado_por   = EXCLUDED.fechado_por,
         created_at    = now()
  RETURNING * INTO v_linha;

  RETURN to_jsonb(v_linha);
END;
$function$;

-- =====================================================================
-- 16. Permissao de execucao.
--
-- REVOKE de PUBLIC e anon antes do GRANT. academia_pode_ver() devolve
-- true quando auth.uid() e nulo — o que e certo para o service_role, mas
-- deixaria o visitante anonimo passar pela guarda se ele pudesse chamar
-- a funcao. Quem tranca a porta e este GRANT.
-- =====================================================================

REVOKE EXECUTE ON FUNCTION public.academia_caixa_conta_da_forma(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_caixa_vendas(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_caixa_resumo(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_caixa_por_categoria(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_caixa_extrato(uuid, date, date, uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_caixa_saldo_contas(uuid, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_caixa_por_dia(uuid, date, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_caixa_lancar(uuid, uuid, text, numeric, text, date, uuid, boolean, date, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_caixa_baixar(uuid, uuid, boolean, date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_caixa_fechar(uuid, uuid, date, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.academia_caixa_conta_da_forma(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_caixa_vendas(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_caixa_resumo(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_caixa_por_categoria(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_caixa_extrato(uuid, date, date, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_caixa_saldo_contas(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_caixa_por_dia(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_caixa_lancar(uuid, uuid, text, numeric, text, date, uuid, boolean, date, uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_caixa_baixar(uuid, uuid, boolean, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_caixa_fechar(uuid, uuid, date, text, uuid) TO authenticated, service_role;

-- =====================================================================
-- 17. Semente da Estacao Funcional.
--
-- Duas contas e as categorias. NENHUM lancamento: o caixa comeca vazio
-- de proposito — despesa inventada vira numero errado no lucro do mes.
-- =====================================================================

INSERT INTO public.academia_caixa_contas (partner_id, nome, tipo, formas_pagamento, posicao)
VALUES
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Caixa', 'dinheiro', ARRAY['dinheiro'], 0),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Banco', 'banco',
   ARRAY['pix','cartao_credito','cartao_debito','transferencia','boleto','outro'], 1)
ON CONFLICT (partner_id, nome) DO NOTHING;

INSERT INTO public.academia_caixa_categorias (partner_id, nome, tipo, cor)
VALUES
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Aluguel',     'saida', '#ef4444'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Energia',     'saida', '#f59e0b'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Agua',        'saida', '#38bdf8'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Internet',    'saida', '#6366f1'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Equipamento', 'saida', '#8b5cf6'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Limpeza',     'saida', '#14b8a6'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Marketing',   'saida', '#ec4899'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Impostos',    'saida', '#dc2626'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Pro-labore',  'saida', '#a16207'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Outros',      'saida', '#94a3b8'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Aporte',      'entrada', '#22c55e'),
  ('646c99dd-23cc-4da5-ba96-e52cfb1384b4', 'Outros',      'entrada', '#94a3b8')
ON CONFLICT (partner_id, tipo, nome) DO NOTHING;
