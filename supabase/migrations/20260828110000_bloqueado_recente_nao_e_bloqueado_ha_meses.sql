-- Bloqueado há uma semana e bloqueado há um ano viram números diferentes.
--
-- "Bloqueados: 256" não pede ação nenhuma, porque mistura duas populações que
-- exigem coisas opostas. Medido na Estação: 27 venceram nos últimos 60 dias —
-- esses são cobrança, dá para ligar hoje. Os outros 229 venceram antes disso, e
-- o mais antigo em 01/10/2025, quase um ano atrás. Para essa gente, mensagem de
-- vencimento chega como se a academia não soubesse que ela foi embora.
--
-- O corte é o mesmo `dias_sumido` da projeção. Aqui ele funciona desde já: não
-- depende do histórico da catraca, e sim de `valido_ate`, que todo mundo tem.
-- É por isso que este filtro mede tempo de VENCIMENTO e não ausência — quem
-- está bloqueado não consegue entrar, então medir ausência de catraca daria
-- "sumido" para todos por construção.
--
-- Três funções mudam, todas por substituição no corpo publicado: são trechos
-- pequenos dentro de funções grandes, e reescrever o resto à mão só criaria
-- chance de errar o que já está certo.

-- 1. `academia_relatorio`: a situação separa os dois, e "vencem em 7 dias" para
--    de listar quem sumiu.
DO $m$
DECLARE v_src text; v_novo text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='academia_relatorio';

  v_novo := replace(v_src,
$a$  v_out  jsonb;
BEGIN$a$,
$b$  v_out  jsonb;
  v_sumido integer;
BEGIN$b$);

  v_novo := replace(v_novo,
$a$  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;$a$,
$b$  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'), COALESCE(c.dias_sumido, 60)
    INTO v_tz, v_sumido
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_sumido := COALESCE(v_sumido, 60);$b$);

  v_novo := replace(v_novo,
$a$        'bloqueados', count(*) FILTER (WHERE a.motivo = 'vencido_bloqueado'),
        'total_com_mensalidade', count(*)$a$,
$b$        -- Bloqueado recente e bloqueado ha meses sao problemas diferentes, e
        -- somados viram um numero que nao pede acao nenhuma. Dos 256 da Estacao,
        -- 229 venceram ha mais de 60 dias -- o mais antigo em 01/10/2025. Quem
        -- e cobranca esta nos 27; o resto e campanha de retorno, ou nada.
        'bloqueados', count(*) FILTER (WHERE a.motivo = 'vencido_bloqueado'
                                         AND a.valido_ate >= v_hoje - v_sumido),
        'bloqueados_antigos', count(*) FILTER (WHERE a.motivo = 'vencido_bloqueado'
                                                 AND a.valido_ate < v_hoje - v_sumido),
        'total_com_mensalidade', count(*)$b$);

  v_novo := replace(v_novo,
$a$vencem_em_7', (
      SELECT count(*) FROM public.acesso_avaliar_academia(p_partner_id) a
       WHERE a.dias_restantes BETWEEN 0 AND 7
    ),$a$,
$b$vencem_em_7', (
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
    ),$b$);

  IF v_novo = v_src THEN RAISE EXCEPTION 'academia_relatorio: nenhum trecho casou'; END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.academia_relatorio(
       p_partner_id uuid, p_de date DEFAULT NULL, p_ate date DEFAULT NULL)
     RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO %L AS %L',
    'public', v_novo);
END
$m$;

-- 2. As campanhas de aviso param de cobrar quem saiu ha muito tempo.
DO $m$
DECLARE v_src text; v_novo text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='academia_avisos_pendentes';

  v_novo := replace(v_src,
$a$DECLARE v_carencia integer; v_tz text; v_hoje date;$a$,
$b$DECLARE v_carencia integer; v_tz text; v_hoje date; v_sumido integer;$b$);

  v_novo := replace(v_novo,
$a$  SELECT COALESCE(c.dias_carencia, 3), COALESCE(c.timezone, 'America/Sao_Paulo')
    INTO v_carencia, v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;$a$,
$b$  SELECT COALESCE(c.dias_carencia, 3), COALESCE(c.timezone, 'America/Sao_Paulo'),
         COALESCE(c.dias_sumido, 60)
    INTO v_carencia, v_tz, v_sumido
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_sumido := COALESCE(v_sumido, 60);$b$);

  v_novo := replace(v_novo,
$a$       AND a.dias_restantes = CASE mo.referencia$a$,
$b$       -- Quem venceu ha mais de `dias_sumido` nao recebe cobranca de
       -- vencimento: para essa pessoa a mensagem chega como se a academia nao
       -- soubesse que ela foi embora. O caminho dela e campanha de retorno, que
       -- tem marco proprio.
       AND a.dias_restantes >= -v_sumido
       AND a.dias_restantes = CASE mo.referencia$b$);

  IF v_novo = v_src THEN RAISE EXCEPTION 'academia_avisos_pendentes: nenhum trecho casou'; END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.academia_avisos_pendentes(p_partner_id uuid)
       RETURNS TABLE(student_id uuid, credencial_id uuid, nome text, telefone text,
                     marco text, dias_restantes integer, valido_ate date)
       LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO %L AS %L',
    'public', v_novo);
END
$m$;

-- 3. O numero novo abre a lista, como todos os outros.
DO $m$
DECLARE v_src text; v_novo text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE proname='academia_relatorio_pessoas_extra';

  v_novo := replace(v_src,
$a$  ELSIF p_categoria = 'dayuse' THEN$a$,
$b$  ELSIF p_categoria = 'bloqueados_antigos' THEN
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

  ELSIF p_categoria = 'dayuse' THEN$b$);

  IF v_novo = v_src THEN RAISE EXCEPTION 'pessoas_extra: nao achei o ponto de insercao'; END IF;

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

-- 4. As LISTAS de "bloqueados" e "vencem em 7 dias" acompanham os cartões.
--
-- Sem isto o cartão diria 27 e a lista traria 256 — e a recepção acreditaria na
-- lista, que é a que tem nome, desconfiando do resto da tela.
--
-- `pg_get_function_ARGUMENTS`, e não `_identity_arguments`: a segunda descarta
-- os DEFAULT e o Postgres recusa com "cannot remove parameter defaults".
DO $m$
DECLARE v_src text; v_novo text; v_args text;
BEGIN
  SELECT prosrc, pg_get_function_arguments(oid) INTO v_src, v_args
    FROM pg_proc WHERE proname='academia_relatorio_pessoas';

  v_novo := replace(v_src,
$a$             WHEN 'bloqueados'  THEN a.motivo  = 'vencido_bloqueado'
             WHEN 'vencem_em_7' THEN a.dias_restantes BETWEEN 0 AND 7$a$,
$b$             -- Os dois cortes acompanham os cartoes. Numero que diz 27 e lista
             -- que traz 256 fazem a recepcao acreditar na lista -- que e a que
             -- tem nome -- e desconfiar do resto da tela.
             WHEN 'bloqueados'  THEN a.motivo = 'vencido_bloqueado'
                                 AND a.valido_ate >= v_hoje - COALESCE(
                                       (SELECT c.dias_sumido FROM public.partner_acesso_config c
                                         WHERE c.partner_id = p_partner_id), 60)
             WHEN 'vencem_em_7' THEN a.dias_restantes BETWEEN 0 AND 7
                                 AND NOT EXISTS (
                                       SELECT 1 FROM public.academia_sumidos(p_partner_id) s
                                        WHERE s.credencial_id IS NOT DISTINCT FROM a.credencial_id
                                          AND s.student_id    IS NOT DISTINCT FROM a.student_id)$b$);

  IF v_novo = v_src THEN RAISE EXCEPTION 'nao achei o CASE das categorias'; END IF;

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.academia_relatorio_pessoas(%s)
       RETURNS TABLE(nome text, telefone text, referencia text, student_id uuid,
                     credencial_id uuid, valido_ate date, dias integer, detalhe text)
       LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO %L AS %L',
    v_args, 'public', v_novo);
END
$m$;
