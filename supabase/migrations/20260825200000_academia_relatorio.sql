-- Relatório próprio da academia.
--
-- Até aqui o faturamento da academia não aparecia em lugar nenhum:
-- `academia_mensalidades` só era lido pelo painel da própria academia, e os
-- relatórios do parceiro nunca souberam que ela existe. Quem toca a academia
-- não tinha número para olhar — nem quanto entrou, nem quanto a maquininha
-- levou, nem quantos vão vencer semana que vem.
--
-- Tudo numa função só, no banco, porque a régua de acesso já mora aqui e
-- somar receita em TypeScript seria a quinta duplicação deste projeto.

CREATE OR REPLACE FUNCTION public.academia_relatorio(
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
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
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
        'bruto',   COALESCE(sum(m.valor), 0),
        'taxas',   COALESCE(sum(m.taxa_valor), 0),
        'liquido', COALESCE(sum(m.valor_liquido), 0)
      )
      FROM public.academia_mensalidades m
      WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
        AND m.created_at::date BETWEEN v_de AND v_ate
    ),

    -- Por forma de pagamento, lendo as partes: uma venda dividida aparece nas
    -- duas linhas, com a taxa de cada uma.
    'por_forma', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'bruto')::numeric DESC)
      FROM (
        SELECT jsonb_build_object(
                 'forma', pg.forma_pagamento,
                 'bruto', sum(pg.valor),
                 'taxas', sum(pg.taxa_valor),
                 'liquido', sum(pg.valor_liquido)
               ) AS x
          FROM public.academia_mensalidade_pagamentos pg
          JOIN public.academia_mensalidades m ON m.id = pg.mensalidade_id
         WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
           AND m.created_at::date BETWEEN v_de AND v_ate
         GROUP BY pg.forma_pagamento
      ) s
    ), '[]'::jsonb),

    'por_plano', COALESCE((
      SELECT jsonb_agg(x ORDER BY (x->>'bruto')::numeric DESC)
      FROM (
        SELECT jsonb_build_object('plano', m.plano, 'vendas', count(*), 'bruto', sum(m.valor)) AS x
          FROM public.academia_mensalidades m
         WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
           AND m.created_at::date BETWEEN v_de AND v_ate
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
        'bloqueados', count(*) FILTER (WHERE a.motivo = 'vencido_bloqueado'),
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
      SELECT count(*) FROM public.acesso_avaliar_academia(p_partner_id) a
       WHERE a.dias_restantes BETWEEN 0 AND 7
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
