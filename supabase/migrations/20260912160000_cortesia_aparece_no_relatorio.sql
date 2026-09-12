-- Cortesia aparece no relatorio da academia.
--
-- Cortesia e mensalidade lancada por aqui com valor zero: o plano "gratuito"
-- ou a renovacao marcada como cortesia. Ate aqui ela era contada como VENDA
-- em "vendas no balcao", sumia da tabela por forma de pagamento (nao tem linha
-- de pagamento para ler) e aparecia nas listas como "R$ 0,00 · outro".
--
-- As duas funcoes partem da definicao que estava em producao em 12/09/2026, e
-- nao da ultima migration do repositorio. O que muda:
--   academia_relatorio            financeiro.cortesias; linha "cortesia" com
--                                 a quantidade em por_forma; qtd em todas
--   academia_relatorio_pessoas_extra  forma + filtro 'cortesia' lista quem
--                                 ganhou; recebido/renovacoes/plano escrevem
--                                 "cortesia" no lugar de "R$ 0,00 · forma"

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
      WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
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
         WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
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
         WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
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
         WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
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
     WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
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
     WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
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
     WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
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
     WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
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
     WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
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
