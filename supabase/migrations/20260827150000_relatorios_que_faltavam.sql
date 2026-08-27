-- Os relatórios que faltavam: projeção, renovações, novos, sumidos e day-use.
--
-- Funções NOVAS em vez de mexer em `academia_relatorio`. Aquela alimenta a tela
-- que a recepção já usa todo dia; qualquer erro ali derruba o que funciona. O
-- que é adicional entra ao lado e pode falhar sozinho.
--
-- A PROJEÇÃO merece explicação. Ela não pode sair do valor lançado: 410 das 413
-- mensalidades vieram do Next Fit com valor zero, então somar o histórico daria
-- quase nada e pareceria que a academia não fatura. Ela sai do PREÇO DE TABELA
-- do plano, casado pelo nome — é o que a academia espera receber se todo mundo
-- renovar o mesmo plano. Quem tem plano que não está no cadastro entra com
-- zero e aparece separado, para o número não mentir por omissão.

CREATE OR REPLACE FUNCTION public.academia_relatorio_extra(
  p_partner_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
  p_projecao_ate date DEFAULT NULL
)
RETURNS TABLE(
  projecao_valor numeric,
  projecao_pessoas integer,
  projecao_sem_preco integer,
  renovacoes_qtd integer,
  renovacoes_valor numeric,
  novos_qtd integer,
  sem_frequencia_qtd integer,
  dayuse_qtd integer,
  dayuse_valor numeric
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

  RETURN QUERY
  WITH ativa AS (
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
    SELECT a.*, pl.valor_padrao
      FROM ativa a
      LEFT JOIN LATERAL public.academia_plano_do_texto(p_partner_id, a.plano) pl ON true
     WHERE a.valido_ate BETWEEN v_hoje AND v_proj
  )
  SELECT
    (SELECT COALESCE(sum(COALESCE(v.valor_padrao, 0)), 0) FROM vencendo v),
    (SELECT count(*)::integer FROM vencendo v),
    (SELECT count(*)::integer FROM vencendo v WHERE v.valor_padrao IS NULL),

    -- Renovacao e mensalidade CRIADA no periodo, nao vencendo nele.
    (SELECT count(*)::integer FROM public.academia_mensalidades m
      WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
        AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate),
    (SELECT COALESCE(sum(m.valor), 0) FROM public.academia_mensalidades m
      WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
        AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate),

    -- Aluno novo e credencial que nasceu no periodo.
    (SELECT count(*)::integer FROM public.academia_credenciais cr
      WHERE cr.partner_id = p_partner_id AND cr.ativo
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
