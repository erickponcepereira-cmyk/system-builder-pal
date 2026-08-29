-- A projeção deixa de contar quem sumiu, e diz quantos tirou.
--
-- Somar quem não aparece há dois meses como se fosse renovar não é otimismo: é
-- previsão errada, e a academia planeja em cima dela.
--
-- `projecao_sumidos` é coluna nova de propósito. Número que encolhe sem
-- explicação vira desconfiança — a tela precisa poder dizer "são 130 menos 12
-- que sumiram", senão a recepção acha que o sistema perdeu gente.
--
-- Hoje o corte não tira ninguém: a catraca só tem 9 dias de histórico e
-- `academia_sumidos` se recusa a chamar de sumido quem ela nunca teve chance de
-- ver. Passa a valer sozinho em 18/10.
--
-- DROP antes do CREATE porque o retorno mudou. `CREATE OR REPLACE` não altera
-- tipo de retorno — erraria com "cannot change return type".
DROP FUNCTION IF EXISTS public.academia_relatorio_extra(uuid, date, date, date);

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
  projecao_sumidos integer,
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

-- A LISTA da projeção some com a mesma gente que o número.
--
-- Lista que discorda do cartão faz a recepção acreditar na lista — que é a que
-- tem nome — e desconfiar do resto da tela. Feito por substituição no corpo
-- publicado: é um trecho dentro de uma função de 8 KB, e reescrever o resto à
-- mão só criaria chance de errar o que já está certo.
DO $m$
DECLARE v_src text; v_novo text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='academia_relatorio_pessoas_extra';

  v_novo := replace(v_src,
$a$      LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
     WHERE a.valido_ate BETWEEN v_hoje AND v_proj
     ORDER BY a.valido_ate, cr.nome_no_equipamento;$a$,
$b$      LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
     WHERE a.valido_ate BETWEEN v_hoje AND v_proj
       -- Mesma exclusao do numero. Lista que discorda do cartao faz a recepcao
       -- acreditar na lista, que e a que tem nome -- e desconfiar do resto.
       AND NOT EXISTS (
         SELECT 1 FROM public.academia_sumidos(p_partner_id) s
          WHERE s.credencial_id IS NOT DISTINCT FROM a.credencial_id
            AND s.student_id    IS NOT DISTINCT FROM a.student_id
       )
     ORDER BY a.valido_ate, cr.nome_no_equipamento;$b$);

  IF v_novo = v_src THEN RAISE EXCEPTION 'nao achei o trecho da projecao'; END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.academia_relatorio_pessoas_extra(
       p_partner_id uuid, p_categoria text, p_de date DEFAULT NULL, p_ate date DEFAULT NULL,
       p_projecao_ate date DEFAULT NULL, p_filtro text DEFAULT NULL)
     RETURNS TABLE(nome text, telefone text, referencia text, student_id uuid,
                   credencial_id uuid, valido_ate date, dias integer, detalhe text)
     LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO %L AS %L',
    'public', v_novo);
END
$m$;
