-- O dinheiro de uma mensalidade passa a contar para a academia que RECEBEU,
-- que pode nao ser a academia da pessoa.
--
-- Caso: Glaucia Cristina Simi (29) e Jozilene Lima Marinho (271) passaram da
-- Jessica para a Estacao Funcional em 12/11/2026 (20261112120000). Com elas
-- foram as mensalidades, e com as mensalidades os R$ 425 que as duas pagaram
-- por pix a Jessica em setembro e outubro - que sairam do relatorio da Jessica.
-- Decisao do Erick: esses meses ficam aparecendo para a Jessica.
--
-- Nao dava para devolver as linhas: `academia_mensalidades.partner_id` decidia
-- tres coisas de uma vez - de quem a pessoa e aluna, se a catraca libera
-- (`academia_agente_retrato` exige mensalidade da mesma academia da credencial)
-- e em que relatorio o dinheiro aparece. Devolver barraria a Jozilene, que pagou
-- ate 16/11, e poria as duas de volta na lista e nos avisos da Jessica.
--
-- 1. Coluna `recebido_por`: a academia que recebeu o dinheiro. Nula e a propria
--    academia da mensalidade - o caso de todas as linhas ate hoje.
-- 2. As quatro funcoes que somam dinheiro passam a filtrar por
--    `COALESCE(recebido_por, partner_id)`: `academia_relatorio` (financeiro, por
--    forma, por plano), `academia_relatorio_extra` (renovacoes),
--    `academia_relatorio_pessoas_extra` (recebido, forma, plano, renovacoes) e
--    `academia_caixa_vendas`. Tudo o que fala de PESSOA - situacao, projecao,
--    sem mensalidade, frequencia, avisos, catraca - continua em `partner_id`.
-- 3. `academia_transferir_credenciais` grava `recebido_por` com a academia de
--    origem ao mover a mensalidade: transferir aluno nao transfere o caixa.
-- 4. As tres mensalidades pagas da Glaucia e da Jozilene ficam com
--    `recebido_por` = Jessica. As duas linhas de R$ 0 importadas do Next Fit
--    ficam como estao: importacao nao entra em nenhuma soma de dinheiro.
--
-- Fica como estava, de proposito: a transferencia de 14/09 (Estacao -> Jessica)
-- levou o dinheiro junto e continua assim. Ninguem pediu para mudar.
--
-- Cada funcao e a definicao de producao de 12/11/2026 com so os filtros de
-- dinheiro trocados; o resto do corpo esta byte a byte igual.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Quem recebeu
-- ---------------------------------------------------------------------------
ALTER TABLE public.academia_mensalidades
  ADD COLUMN IF NOT EXISTS recebido_por uuid REFERENCES public.partners(id);

COMMENT ON COLUMN public.academia_mensalidades.recebido_por IS
  'Academia que recebeu o dinheiro, quando nao e a academia da pessoa (partner_id) - acontece depois de transferir o aluno. Nulo = partner_id. Relatorios e caixa somam por COALESCE(recebido_por, partner_id); acesso, lista e avisos continuam por partner_id.';

-- ---------------------------------------------------------------------------
-- 2) Relatorios e caixa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.academia_relatorio(p_partner_id uuid, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz   text;
  v_hoje date;
  v_de   date;
  v_ate  date;
  v_out  jsonb;
  v_sumido integer;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'), COALESCE(c.dias_sumido, 60)
    INTO v_tz, v_sumido
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_sumido := COALESCE(v_sumido, 60);
  v_hoje := (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date;
  v_de   := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate  := COALESCE(p_ate, v_hoje);

  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('de', v_de, 'ate', v_ate, 'hoje', v_hoje),

    -- Dinheiro do período. O bruto é o que a recepção recebeu; o líquido é o
    -- que sobra depois da maquininha. A diferença entre os dois é a única
    -- forma de a academia enxergar quanto a taxa custa por mês.
    -- Dinheiro conta para quem RECEBEU (recebido_por), que so difere da
    -- academia da pessoa depois de uma transferencia de aluno.
    'financeiro', (
      SELECT jsonb_build_object(
        'lancamentos', count(*),
        -- Cortesia conta a parte: "vendas no balcao" nao pode incluir quem
        -- nao pagou, e quem ganhou precisa ser visto.
        'cortesias', count(*) FILTER (WHERE m.valor = 0),
        'bruto',   COALESCE(sum(m.valor), 0),
        'taxas',   COALESCE(sum(m.taxa_valor), 0),
        'liquido', COALESCE(sum(m.valor_liquido), 0)
      )
      FROM public.academia_mensalidades m
      WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
        AND (m.created_at AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date
            BETWEEN v_de AND v_ate
        -- Importacao nao e venda: 404 das 418 vieram do Next Fit com
        -- valor zero, e contá-las fazia a média virar R$ 3,23.
        AND m.importado_de IS NULL
    ),

    -- Por forma de pagamento, lendo as partes: uma venda dividida aparece nas
    -- duas linhas, com a taxa de cada uma.
    'por_forma', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'bruto')::numeric DESC)
      FROM (
        SELECT jsonb_build_object(
                 'forma', pg.forma_pagamento,
                 'qtd', count(*),
                 'bruto', sum(pg.valor),
                 'taxas', sum(pg.taxa_valor),
                 'liquido', sum(pg.valor_liquido)
               ) AS x
          FROM public.academia_mensalidade_pagamentos pg
          JOIN public.academia_mensalidades m ON m.id = pg.mensalidade_id
         WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
           AND (m.created_at AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date
               BETWEEN v_de AND v_ate
           AND m.importado_de IS NULL
         GROUP BY pg.forma_pagamento
        UNION ALL
        -- Cortesia nao tem linha de pagamento, e por isso sumia desta tabela.
        -- Entra como linha propria: o dinheiro e zero, a quantidade nao.
        SELECT jsonb_build_object(
                 'forma', 'cortesia',
                 'qtd', count(*),
                 'bruto', 0,
                 'taxas', 0,
                 'liquido', 0
               )
          FROM public.academia_mensalidades m
         WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
           AND (m.created_at AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date
               BETWEEN v_de AND v_ate
           AND m.importado_de IS NULL
           AND m.valor = 0
        HAVING count(*) > 0
      ) s
    ), '[]'::jsonb),

    'por_plano', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'bruto')::numeric DESC)
      FROM (
        SELECT jsonb_build_object('plano', m.plano, 'vendas', count(*), 'bruto', sum(m.valor)) AS x
          FROM public.academia_mensalidades m
         WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
           AND (m.created_at AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date
               BETWEEN v_de AND v_ate
           AND m.importado_de IS NULL
         GROUP BY m.plano
      ) s
    ), '[]'::jsonb),

    -- Situação de HOJE, não do período: é a foto de quem entra e quem não entra
    -- agora. Vem da mesma régua que a catraca usa, para os dois nunca
    -- discordarem.
    'situacao', (
      SELECT jsonb_build_object(
        'liberados',  count(*) FILTER (WHERE a.decisao = 'liberado'),
        'em_carencia', count(*) FILTER (WHERE a.motivo = 'em_carencia'),
        'a_vencer',   count(*) FILTER (WHERE a.motivo = 'vencimento_proximo'),
        -- Bloqueado recente e bloqueado ha meses sao problemas diferentes, e
        -- somados viram um numero que nao pede acao nenhuma. Dos 256 da Estacao,
        -- 229 venceram ha mais de 60 dias -- o mais antigo em 01/10/2025. Quem
        -- e cobranca esta nos 27; o resto e campanha de retorno, ou nada.
        'bloqueados', count(*) FILTER (WHERE a.motivo = 'vencido_bloqueado'
                                         AND a.valido_ate >= v_hoje - v_sumido),
        'bloqueados_antigos', count(*) FILTER (WHERE a.motivo = 'vencido_bloqueado'
                                                 AND a.valido_ate < v_hoje - v_sumido),
        'total_com_mensalidade', count(*)
      )
      FROM public.acesso_avaliar_academia(p_partner_id) a
    ),

    'sem_mensalidade', (
      SELECT count(*) FROM public.academia_credenciais cr
       WHERE cr.partner_id = p_partner_id AND cr.ativo
         AND NOT EXISTS (
           SELECT 1 FROM public.academia_mensalidades m
            WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
              AND (m.credencial_id = cr.id
                OR (m.credencial_id IS NULL AND cr.student_id IS NOT NULL AND m.student_id = cr.student_id))
         )
    ),

    -- Quem vence nos próximos 7 dias: é a lista de trabalho da recepção, e o
    -- número que diz se o mês que vem já está vendido.
    'vencem_em_7', (
      -- E a lista de ligacao da recepcao. Quem nao aparece ha dois meses nao
      -- renova por telefonema; fica de fora para a lista ser o que ela promete
      -- ser -- gente que vale a ligacao de hoje.
      SELECT count(*) FROM public.acesso_avaliar_academia(p_partner_id) a
       WHERE a.dias_restantes BETWEEN 0 AND 7
         AND NOT EXISTS (
           SELECT 1 FROM public.academia_sumidos(p_partner_id) s
            WHERE s.credencial_id IS NOT DISTINCT FROM a.credencial_id
              AND s.student_id    IS NOT DISTINCT FROM a.student_id
         )
    ),

    -- Movimento da catraca no período.
    'frequencia', (
      SELECT jsonb_build_object(
        'entradas', count(*),
        'pessoas',  count(DISTINCT COALESCE(f.credencial_id::text, f.student_id::text)),
        'manuais',  count(*) FILTER (WHERE f.origem = 'manual')
      )
      FROM public.academia_frequencias f
      WHERE f.partner_id = p_partner_id
        AND (f.entrada_em AT TIME ZONE COALESCE(v_tz,'America/Sao_Paulo'))::date BETWEEN v_de AND v_ate
    ),

    'negados', (
      SELECT count(*) FROM public.academia_acessos_negados n
       WHERE n.partner_id = p_partner_id
         AND (n.tentado_em AT TIME ZONE COALESCE(v_tz,'America/Sao_Paulo'))::date BETWEEN v_de AND v_ate
    )
  ) INTO v_out;

  RETURN v_out;
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_relatorio_extra(p_partner_id uuid, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date, p_projecao_ate date DEFAULT NULL::date)
 RETURNS TABLE(projecao_valor numeric, projecao_pessoas integer, projecao_sem_preco integer, projecao_sumidos integer, renovacoes_qtd integer, renovacoes_valor numeric, novos_qtd integer, sem_frequencia_qtd integer, dayuse_qtd integer, dayuse_valor numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
  v_hoje date;
  v_de date;
  v_ate date;
  v_proj date;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  v_de := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate := COALESCE(p_ate, v_hoje);
  v_proj := COALESCE(p_projecao_ate, (v_hoje + 30));

  RETURN QUERY
  WITH sumido AS (
    SELECT s.credencial_id, s.student_id FROM public.academia_sumidos(p_partner_id) s
  ),
  ativa AS (
    -- Uma linha por pessoa, valendo o vencimento mais longo dela -- a mesma
    -- regra que a catraca usa para decidir.
    SELECT DISTINCT ON (COALESCE(m.credencial_id::text, m.student_id::text))
           m.credencial_id, m.student_id, m.valido_ate, m.plano
      FROM public.academia_mensalidades m
     WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
     ORDER BY COALESCE(m.credencial_id::text, m.student_id::text), m.valido_ate DESC
  ),
  -- Quem vence dentro da janela da projecao. Quem ja venceu nao entra: nao e
  -- previsao, e inadimplencia, e ela ja aparece em "bloqueados".
  vencendo AS (
    -- Pelo catalogo OU pelo apelido: 410 das 413 mensalidades vieram do Next
    -- Fit com o nome "Funcional - Mensal - Livre", que o catalogo chama de
    -- "Mensal - Livre". Sem isso a projecao casava 3 pessoas de 138.
    SELECT a.*, pl.valor_padrao,
           EXISTS (SELECT 1 FROM sumido s
                    WHERE s.credencial_id IS NOT DISTINCT FROM a.credencial_id
                      AND s.student_id IS NOT DISTINCT FROM a.student_id) AS sumiu
      FROM ativa a
      LEFT JOIN LATERAL public.academia_plano_do_texto(p_partner_id, a.plano) pl ON true
     WHERE a.valido_ate BETWEEN v_hoje AND v_proj
  )
  SELECT
    -- Quem sumiu nao entra na conta. Continua sendo contado a parte, para o
    -- numero poder se explicar.
    (SELECT COALESCE(sum(COALESCE(v.valor_padrao, 0)), 0) FROM vencendo v WHERE NOT v.sumiu),
    (SELECT count(*)::integer FROM vencendo v WHERE NOT v.sumiu),
    (SELECT count(*)::integer FROM vencendo v WHERE NOT v.sumiu AND v.valor_padrao IS NULL),
    (SELECT count(*)::integer FROM vencendo v WHERE v.sumiu),

    -- Renovacao e VENDA criada no periodo. Importacao nao e renovacao: sem o
    -- filtro, 418 apareciam onde ha 14.
    -- Venda conta para quem recebeu (recebido_por).
    (SELECT count(*)::integer FROM public.academia_mensalidades m
      WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
        AND m.importado_de IS NULL
        AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate),
    (SELECT COALESCE(sum(m.valor), 0) FROM public.academia_mensalidades m
      WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
        AND m.importado_de IS NULL
        AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate),

    -- Aluno novo e credencial que a academia cadastrou. Quem veio da planilha
    -- ja treinava aqui antes -- contar como novo daria a impressao de um mes
    -- recorde que nunca aconteceu.
    (SELECT count(*)::integer FROM public.academia_credenciais cr
      WHERE cr.partner_id = p_partner_id AND cr.ativo
        AND cr.importado_em IS NULL
        AND (cr.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate),

    -- Contrato ativo e ninguem viu a pessoa. E a lista de quem esta pagando e
    -- sumindo -- quem cancela mes que vem, se ninguem ligar antes.
    (SELECT count(*)::integer
       FROM ativa a
      WHERE a.valido_ate >= v_hoje
        AND NOT EXISTS (
          SELECT 1 FROM public.academia_frequencias f
           WHERE f.partner_id = p_partner_id
             AND (f.entrada_em AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
             AND (f.credencial_id = a.credencial_id
               OR (a.credencial_id IS NULL AND a.student_id IS NOT NULL AND f.student_id = a.student_id))
        )),

    (SELECT count(*)::integer FROM public.academia_dayuse d
      WHERE d.partner_id = p_partner_id
        AND (d.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate),
    (SELECT COALESCE(sum(d.valor), 0) FROM public.academia_dayuse d
      WHERE d.partner_id = p_partner_id
        AND (d.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate);
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_relatorio_pessoas_extra(p_partner_id uuid, p_categoria text, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date, p_projecao_ate date DEFAULT NULL::date, p_filtro text DEFAULT NULL::text)
 RETURNS TABLE(nome text, telefone text, referencia text, student_id uuid, credencial_id uuid, valido_ate date, dias integer, detalhe text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tz text;
  v_hoje date;
  v_de date;
  v_ate date;
  v_proj date;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_de := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate := COALESCE(p_ate, v_hoje);
  v_proj := COALESCE(p_projecao_ate, (v_hoje + 30));

  IF p_categoria = 'projecao' THEN
    RETURN QUERY
    WITH ativa AS (
      SELECT DISTINCT ON (COALESCE(m.credencial_id::text, m.student_id::text))
             m.credencial_id, m.student_id, m.valido_ate, m.plano
        FROM public.academia_mensalidades m
       WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
       ORDER BY COALESCE(m.credencial_id::text, m.student_id::text), m.valido_ate DESC
    )
    SELECT cr.nome_no_equipamento, cr.telefone, cr.referencia, a.student_id, a.credencial_id,
           a.valido_ate, (a.valido_ate - v_hoje)::integer,
           -- Sem COALESCE aqui: moeda_br devolve "0,00" para NULL, entao o
           -- fallback nunca dispararia e quem nao tem preco viraria R$ 0,00.
           a.plano || CASE WHEN pl.valor_padrao IS NULL THEN ' · sem preço de tabela'
                           ELSE ' · R$ ' || public.moeda_br(pl.valor_padrao) END
      FROM ativa a
      LEFT JOIN LATERAL public.academia_plano_do_texto(p_partner_id, a.plano) pl ON true
      LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
     WHERE a.valido_ate BETWEEN v_hoje AND v_proj
       -- Mesma exclusao do numero. Lista que discorda do cartao faz a recepcao
       -- acreditar na lista, que e a que tem nome -- e desconfiar do resto.
       AND NOT EXISTS (
         SELECT 1 FROM public.academia_sumidos(p_partner_id) s
          WHERE s.credencial_id IS NOT DISTINCT FROM a.credencial_id
            AND s.student_id    IS NOT DISTINCT FROM a.student_id
       )
     ORDER BY a.valido_ate, cr.nome_no_equipamento;

  /*
   * As tres de dinheiro andam juntas, e as tres excluem importacao.
   *
   * `importado_de IS NULL` e a mesma regra que o cartao usa para contar. Se a
   * lista trouxesse as 404 linhas do Next Fit, o numero e a lista discordariam
   * -- e a recepcao acreditaria na lista, que e a que tem nome.
   *
   * Valor zero e cortesia, e a lista diz isso com a palavra: "R$ 0,00 · outro"
   * fazia a cortesia parecer venda esquecida.
   *
   * E as quatro (com renovacoes) contam para quem RECEBEU (recebido_por), a
   * mesma regra do cartao.
   */
  ELSIF p_categoria = 'recebido' THEN
    RETURN QUERY
    SELECT cr.nome_no_equipamento, cr.telefone, cr.referencia, m.student_id, m.credencial_id,
           m.valido_ate, (m.valido_ate - v_hoje)::integer,
           m.plano || CASE WHEN m.valor = 0 THEN ' · cortesia'
                           ELSE ' · R$ ' || public.moeda_br(m.valor)
                                || COALESCE(' · ' || m.forma_pagamento, '') END
      FROM public.academia_mensalidades m
      LEFT JOIN public.academia_credenciais cr ON cr.id = m.credencial_id
     WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
       AND m.importado_de IS NULL
       AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
     ORDER BY m.created_at DESC;

  ELSIF p_categoria = 'forma' AND p_filtro = 'cortesia' THEN
    RETURN QUERY
    -- A linha "Cortesia" da tabela por forma. Nao ha pagamento para ler: sai
    -- da mensalidade de valor zero, a mesma regra que contou a linha.
    SELECT cr.nome_no_equipamento, cr.telefone, cr.referencia, m.student_id, m.credencial_id,
           m.valido_ate, (m.valido_ate - v_hoje)::integer,
           m.plano || ' · cortesia'
      FROM public.academia_mensalidades m
      LEFT JOIN public.academia_credenciais cr ON cr.id = m.credencial_id
     WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
       AND m.importado_de IS NULL
       AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
       AND m.valor = 0
     ORDER BY m.created_at DESC;

  ELSIF p_categoria = 'forma' THEN
    RETURN QUERY
    -- Sai da tabela de PAGAMENTOS, nao da mensalidade: uma venda dividida entre
    -- pix e cartao aparece nas duas listas, cada uma com a sua parte -- que e
    -- exatamente como o numero da tela foi somado.
    SELECT cr.nome_no_equipamento, cr.telefone, cr.referencia, m.student_id, m.credencial_id,
           m.valido_ate, (m.valido_ate - v_hoje)::integer,
           m.plano || ' · R$ ' || public.moeda_br(pg.valor)
      FROM public.academia_mensalidade_pagamentos pg
      JOIN public.academia_mensalidades m ON m.id = pg.mensalidade_id
      LEFT JOIN public.academia_credenciais cr ON cr.id = m.credencial_id
     WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
       AND m.importado_de IS NULL
       AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
       AND pg.forma_pagamento = p_filtro
     ORDER BY m.created_at DESC;

  ELSIF p_categoria = 'plano' THEN
    RETURN QUERY
    SELECT cr.nome_no_equipamento, cr.telefone, cr.referencia, m.student_id, m.credencial_id,
           m.valido_ate, (m.valido_ate - v_hoje)::integer,
           CASE WHEN m.valor = 0 THEN 'cortesia'
                ELSE 'R$ ' || public.moeda_br(m.valor) || COALESCE(' · ' || m.forma_pagamento, '') END
      FROM public.academia_mensalidades m
      LEFT JOIN public.academia_credenciais cr ON cr.id = m.credencial_id
     WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
       AND m.importado_de IS NULL
       AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
       AND m.plano = p_filtro
     ORDER BY m.created_at DESC;

  ELSIF p_categoria = 'renovacoes' THEN
    RETURN QUERY
    SELECT cr.nome_no_equipamento, cr.telefone, cr.referencia, m.student_id, m.credencial_id,
           m.valido_ate, (m.valido_ate - v_hoje)::integer,
           m.plano || CASE WHEN m.valor = 0 THEN ' · cortesia'
                           ELSE ' · R$ ' || public.moeda_br(m.valor)
                                || COALESCE(' · ' || m.forma_pagamento, '') END
      FROM public.academia_mensalidades m
      LEFT JOIN public.academia_credenciais cr ON cr.id = m.credencial_id
     WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id AND m.status = 'ativa'
       AND m.importado_de IS NULL
       AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
     ORDER BY m.created_at DESC;

  ELSIF p_categoria = 'novos' THEN
    RETURN QUERY
    SELECT cr.nome_no_equipamento, cr.telefone, cr.referencia, cr.student_id, cr.id,
           NULL::date, NULL::integer,
           'entrou em ' || to_char((cr.created_at AT TIME ZONE v_tz)::date, 'DD/MM')
      FROM public.academia_credenciais cr
     WHERE cr.partner_id = p_partner_id AND cr.ativo
       AND cr.importado_em IS NULL
       AND (cr.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
     ORDER BY cr.created_at DESC;

  ELSIF p_categoria = 'sem_frequencia' THEN
    RETURN QUERY
    WITH ativa AS (
      SELECT DISTINCT ON (COALESCE(m.credencial_id::text, m.student_id::text))
             m.credencial_id, m.student_id, m.valido_ate, m.plano
        FROM public.academia_mensalidades m
       WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
       ORDER BY COALESCE(m.credencial_id::text, m.student_id::text), m.valido_ate DESC
    )
    SELECT cr.nome_no_equipamento, cr.telefone, cr.referencia, a.student_id, a.credencial_id,
           a.valido_ate, (a.valido_ate - v_hoje)::integer,
           -- A última vez que a catraca viu essa pessoa, em qualquer data.
           COALESCE('visto por último em ' || to_char(
             (SELECT max(f2.entrada_em) FROM public.academia_frequencias f2
               WHERE f2.partner_id = p_partner_id
                 AND (f2.credencial_id = a.credencial_id
                   OR (a.credencial_id IS NULL AND a.student_id IS NOT NULL AND f2.student_id = a.student_id))
             ) AT TIME ZONE v_tz, 'DD/MM'), 'nunca passou na catraca')
      FROM ativa a
      LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
     WHERE a.valido_ate >= v_hoje
       AND NOT EXISTS (
         SELECT 1 FROM public.academia_frequencias f
          WHERE f.partner_id = p_partner_id
            AND (f.entrada_em AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
            AND (f.credencial_id = a.credencial_id
              OR (a.credencial_id IS NULL AND a.student_id IS NOT NULL AND f.student_id = a.student_id))
       )
     ORDER BY cr.nome_no_equipamento;

  ELSIF p_categoria = 'bloqueados_antigos' THEN
    RETURN QUERY
    -- Quem venceu ha mais de `dias_sumido`. Sai da mesma regua da catraca, para
    -- o numero e a lista nunca discordarem.
    SELECT COALESCE(pr.name, cr.nome_no_equipamento)::text,
           COALESCE(pr.phone, cr.telefone)::text,
           cr.referencia, a.student_id, a.credencial_id,
           a.valido_ate, a.dias_restantes,
           'venceu em ' || to_char(a.valido_ate, 'DD/MM/YYYY')
             || ' · ' || abs(a.dias_restantes)::text || ' dias atras'
      FROM public.acesso_avaliar_academia(p_partner_id) a
      LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
      LEFT JOIN public.students s  ON s.id = a.student_id
      LEFT JOIN public.profiles pr ON pr.id = s.profile_id
     WHERE a.motivo = 'vencido_bloqueado'
       AND a.valido_ate < v_hoje - COALESCE(
             (SELECT c.dias_sumido FROM public.partner_acesso_config c
               WHERE c.partner_id = p_partner_id), 60)
     ORDER BY a.valido_ate DESC;

  ELSIF p_categoria = 'dayuse' THEN
    RETURN QUERY
    SELECT d.nome, d.telefone, d.cpf_final, NULL::uuid, NULL::uuid,
           (d.created_at AT TIME ZONE v_tz)::date, NULL::integer,
           COALESCE(d.tipo, 'day-use') || ' · R$ ' || public.moeda_br(d.valor)
             || COALESCE(' · ' || d.forma_pagamento, '')
      FROM public.academia_dayuse d
     WHERE d.partner_id = p_partner_id
       AND (d.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
     ORDER BY d.created_at DESC;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_caixa_vendas(p_partner_id uuid, p_de date, p_ate date)
 RETURNS TABLE(fonte text, fonte_id uuid, data_local date, descricao text, forma_pagamento text, bruto numeric, taxa numeric, liquido numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
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

  -- Mensalidade entra no caixa de quem RECEBEU (recebido_por).
  RETURN QUERY
  SELECT 'mensalidade'::text, m.id,
         (m.created_at AT TIME ZONE v_tz)::date,
         m.plano,
         pg.forma_pagamento,
         pg.valor, pg.taxa_valor, pg.valor_liquido
    FROM public.academia_mensalidades m
    JOIN public.academia_mensalidade_pagamentos pg ON pg.mensalidade_id = m.id
   WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id
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
   WHERE COALESCE(m.recebido_por, m.partner_id) = p_partner_id
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

-- ---------------------------------------------------------------------------
-- 3) Transferir aluno nao transfere o caixa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.academia_transferir_credenciais(p_origem uuid, p_destino uuid, p_credenciais uuid[], p_nota text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fora text;
  v_choque text;
  v_refs text[];
  v_alunos uuid[];
  v_cartoes uuid[];
  v_saida jsonb := '{}'::jsonb;
  n integer;
BEGIN
  IF p_origem = p_destino THEN
    RAISE EXCEPTION 'Origem e destino sao a mesma academia.';
  END IF;
  IF COALESCE(cardinality(p_credenciais), 0) = 0 THEN
    RAISE EXCEPTION 'Nenhuma credencial informada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_parceiros_do_grupo(p_origem) g WHERE g.partner_id = p_destino) THEN
    RAISE EXCEPTION 'As academias nao dividem equipamento: a pessoa perderia a catraca.';
  END IF;

  SELECT string_agg(x::text, ', ') INTO v_fora
    FROM unnest(p_credenciais) x
   WHERE NOT EXISTS (SELECT 1 FROM public.academia_credenciais c WHERE c.id = x AND c.partner_id = p_origem);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'Credenciais que nao sao da academia de origem: %', v_fora;
  END IF;

  SELECT string_agg(c.referencia, ', ') INTO v_choque
    FROM public.academia_credenciais c
    JOIN public.academia_credenciais d
      ON d.partner_id = p_destino AND d.tipo = c.tipo AND d.referencia = c.referencia
   WHERE c.id = ANY(p_credenciais);
  IF v_choque IS NOT NULL THEN
    RAISE EXCEPTION 'A academia de destino ja tem estas referencias: %', v_choque;
  END IF;

  SELECT array_agg(c.referencia), array_agg(c.student_id) FILTER (WHERE c.student_id IS NOT NULL)
    INTO v_refs, v_alunos
    FROM public.academia_credenciais c WHERE c.id = ANY(p_credenciais);

  SELECT array_agg(DISTINCT ca.id) INTO v_cartoes
    FROM public.academia_crm_cartoes ac
    JOIN public.crm_cartoes ca ON ca.id = ac.cartao_id
   WHERE ac.partner_id = p_origem AND ac.credencial_id = ANY(p_credenciais) AND ca.arquivado_em IS NULL;
  IF v_cartoes IS NOT NULL THEN
    INSERT INTO public.crm_atividades (cartao_id, tipo, corpo)
    SELECT x, 'sistema', p_nota FROM unnest(v_cartoes) x;
    UPDATE public.crm_cartoes SET arquivado_em = now() WHERE id = ANY(v_cartoes);
  END IF;
  v_saida := v_saida || jsonb_build_object('cartoes_arquivados', COALESCE(cardinality(v_cartoes), 0));

  -- A mensalidade vai com a pessoa (acesso, lista, avisos), mas o dinheiro
  -- fica com quem recebeu: recebido_por guarda a academia de origem.
  UPDATE public.academia_mensalidades
     SET partner_id = p_destino,
         recebido_por = COALESCE(recebido_por, partner_id)
   WHERE partner_id = p_origem
     AND (credencial_id = ANY(p_credenciais)
       OR (credencial_id IS NULL AND student_id = ANY(COALESCE(v_alunos, '{}'))));
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('mensalidades', n);

  UPDATE public.academia_frequencias SET partner_id = p_destino
   WHERE partner_id = p_origem
     AND (credencial_id = ANY(p_credenciais)
       OR (credencial_id IS NULL AND student_id = ANY(COALESCE(v_alunos, '{}'))));
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('frequencias', n);

  UPDATE public.academia_acessos_negados SET partner_id = p_destino
   WHERE partner_id = p_origem AND referencia = ANY(v_refs);
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('barradas', n);

  UPDATE public.academia_avisos SET partner_id = p_destino
   WHERE partner_id = p_origem AND credencial_id = ANY(p_credenciais);
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('avisos', n);

  UPDATE public.academia_faces_envio SET partner_id = p_destino
   WHERE partner_id = p_origem AND referencia = ANY(v_refs);
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('envios_de_rosto', n);

  UPDATE public.academia_credenciais SET partner_id = p_destino WHERE id = ANY(p_credenciais);
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('credenciais', n);

  RETURN v_saida;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4) Os meses da Glaucia e da Jozilene voltam para o caixa da Jessica
-- ---------------------------------------------------------------------------
UPDATE public.academia_mensalidades
   SET recebido_por = 'afcad56d-247c-48b7-bed0-7ea0ee30ae08'  -- Jessica
 WHERE id IN (
         'd3d23ae7-473c-44b1-926e-343638b45569',  -- 271 Jozilene, R$ 145, 17/09
         'c3502085-75a0-4ee2-a18e-32c717a363d8',  -- 271 Jozilene, R$ 145, 17/10
         '08413779-1f93-4af6-baba-779443ae1637'   -- 29  Glaucia,  R$ 135, 24/09
       )
   AND partner_id = '646c99dd-23cc-4da5-ba96-e52cfb1384b4';  -- hoje na Estacao

COMMIT;
