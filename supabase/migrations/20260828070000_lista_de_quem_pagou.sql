-- Os números de dinheiro passam a abrir a lista de quem pagou.
--
-- "Recebido R$ 1.350,00" não diz de quem. "Por forma de pagamento: PIX R$ 965"
-- também não, nem "Por plano". São justamente os números que a recepção precisa
-- conferir contra o caixa no fim do dia, e conferir sem nome é conferir no
-- escuro.
--
-- `p_filtro` é novo: 'forma' precisa saber QUAL forma, 'plano' QUAL plano. As
-- categorias antigas ignoram.
--
-- DROP antes do CREATE porque a lista de parâmetros mudou. `CREATE OR REPLACE`
-- não substitui nesse caso: cria uma segunda função com a assinatura antiga, e
-- fica valendo a que o chamador casar. Já aconteceu com `academia_renovar` em
-- 27/08 — sobrou uma versão sem o limite semanal esperando alguém tropeçar.
DROP FUNCTION IF EXISTS public.academia_relatorio_pessoas_extra(uuid, text, date, date, date);

CREATE OR REPLACE FUNCTION public.academia_relatorio_pessoas_extra(
  p_partner_id uuid,
  p_categoria text,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
  p_projecao_ate date DEFAULT NULL,
  p_filtro text DEFAULT NULL
)
RETURNS TABLE(
  nome text,
  telefone text,
  referencia text,
  student_id uuid,
  credencial_id uuid,
  valido_ate date,
  dias integer,
  detalhe text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
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
     ORDER BY a.valido_ate, cr.nome_no_equipamento;

  /*
   * As tres de dinheiro andam juntas, e as tres excluem importacao.
   *
   * `importado_de IS NULL` e a mesma regra que o cartao usa para contar. Se a
   * lista trouxesse as 404 linhas do Next Fit, o numero e a lista discordariam
   * -- e a recepcao acreditaria na lista, que e a que tem nome.
   */
  ELSIF p_categoria = 'recebido' THEN
    RETURN QUERY
    SELECT cr.nome_no_equipamento, cr.telefone, cr.referencia, m.student_id, m.credencial_id,
           m.valido_ate, (m.valido_ate - v_hoje)::integer,
           m.plano || ' · R$ ' || public.moeda_br(m.valor)
             || COALESCE(' · ' || m.forma_pagamento, '')
      FROM public.academia_mensalidades m
      LEFT JOIN public.academia_credenciais cr ON cr.id = m.credencial_id
     WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
       AND m.importado_de IS NULL
       AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
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
           'R$ ' || public.moeda_br(m.valor) || COALESCE(' · ' || m.forma_pagamento, '')
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
           m.plano || ' · R$ ' || public.moeda_br(m.valor)
             || COALESCE(' · ' || m.forma_pagamento, '')
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
