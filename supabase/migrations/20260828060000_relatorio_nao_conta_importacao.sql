-- O relatório parava de chamar importação de venda.
--
-- A tela mostrava "Recebido R$ 1.350,00 · 418 lançamento(s)". O dinheiro estava
-- certo; a contagem, não. Dos 418, apenas 14 são venda no balcão — os outros
-- 404 são as mensalidades que vieram do Next Fit, todas com valor zero. Isso dá
-- R$ 3,23 por lançamento, que não é preço de academia nenhuma, e foi o que fez
-- o dono desconfiar do número.
--
-- O mesmo aparecia em "Por plano" (247 vendas de um plano que rendeu R$ 0,00) e
-- em "Alunos novos: 413" — as 413 credenciais TAMBÉM vieram da importação, e o
-- número real de alunos novos no período é zero.
--
-- A régua: `importado_de` preenchido é importação; nulo é venda de verdade.
--
-- DE QUEBRA, o mesmo trecho comparava `m.created_at::date` sem fuso. O banco
-- roda em UTC; em Cuiabá, tudo que é lançado depois das 20h já contava para o
-- dia seguinte. É o terceiro lugar do sistema com esse mesmo engano.
--
-- Feito por substituição no corpo publicado, e não reescrevendo a função
-- inteira: são três trechos idênticos dentro de 4.5 KB de SQL, e transcrever o
-- resto à mão só criaria chance de errar o que já está certo.

DO $migra$
DECLARE
  v_src  text;
  v_novo text;
  v_n    int;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname = 'academia_relatorio';
  IF v_src IS NULL THEN RAISE EXCEPTION 'academia_relatorio nao existe'; END IF;

  -- Bloco 'financeiro' (indentação de 6).
  v_novo := replace(v_src,
    E'      WHERE m.partner_id = p_partner_id AND m.status = \'ativa\'\n        AND m.created_at::date BETWEEN v_de AND v_ate',
    E'      WHERE m.partner_id = p_partner_id AND m.status = \'ativa\'\n'
    || E'        AND (m.created_at AT TIME ZONE COALESCE(v_tz, \'America/Sao_Paulo\'))::date\n'
    || E'            BETWEEN v_de AND v_ate\n'
    || E'        -- Importacao nao e venda: 404 das 418 vieram do Next Fit com\n'
    || E'        -- valor zero, e contá-las fazia a média virar R$ 3,23.\n'
    || E'        AND m.importado_de IS NULL');

  -- Blocos 'por_forma' e 'por_plano' (indentação de 9).
  v_novo := replace(v_novo,
    E'         WHERE m.partner_id = p_partner_id AND m.status = \'ativa\'\n           AND m.created_at::date BETWEEN v_de AND v_ate',
    E'         WHERE m.partner_id = p_partner_id AND m.status = \'ativa\'\n'
    || E'           AND (m.created_at AT TIME ZONE COALESCE(v_tz, \'America/Sao_Paulo\'))::date\n'
    || E'               BETWEEN v_de AND v_ate\n'
    || E'           AND m.importado_de IS NULL');

  v_n := (length(v_novo) - length(replace(v_novo, 'importado_de IS NULL', '')))
         / length('importado_de IS NULL');
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'esperava 3 trechos corrigidos, saíram %', v_n;
  END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.academia_relatorio(
       p_partner_id uuid, p_de date DEFAULT NULL, p_ate date DEFAULT NULL)
     RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO %L AS %L',
    'public', v_novo);
END
$migra$;

/*
 * "Alunos novos" para de contar quem veio da planilha.
 *
 * `academia_credenciais.importado_em` marca quem entrou pela importação. As 413
 * da Estação têm todas essa marca — o número real de alunos novos no período é
 * zero, e mostrar 413 dava à academia a impressão de um mês recorde que nunca
 * aconteceu.
 *
 * `renovacoes_qtd` pelo mesmo motivo: 418 viravam 14.
 */
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

    -- Renovacao e VENDA criada no periodo. Importacao nao e renovacao: sem o
    -- filtro, 418 apareciam onde ha 14.
    (SELECT count(*)::integer FROM public.academia_mensalidades m
      WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
        AND m.importado_de IS NULL
        AND (m.created_at AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate),
    (SELECT COALESCE(sum(m.valor), 0) FROM public.academia_mensalidades m
      WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
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
