-- Turma com aluno, padrão de horário e constância.
--
-- O dono descreveu duas academias com regimes diferentes e pediu UM sistema:
--
--   "nessa academia especifica, os alunos podem ir na hora que quiserem. tenho
--    outra academia que os alunos precisam marcar o horario que vao participar
--    do treino. (...) tem alunos que tem o plano de 3x na semana, ou seja, ela
--    pode ir uma semana segunda quarta e sexta, na outra, segunda terça e
--    quarta... entao deve ter uma forma de saber o normal que a pessoa vai, que
--    ela mudou de horario, se adaptar ao padrao do aluno e dar relatorio de
--    constancia (...) quem faltou, quantidades de faltas para a gente ver quem
--    pode estar desanimado, faltando muito, sem aparecer"
--
-- A frase que decide o desenho inteiro é "ela pode ir uma semana segunda quarta
-- e sexta, na outra, segunda terça e quarta". No regime LIVRE a régua é QUANTOS
-- treinos na semana contra a meta do plano — NUNCA quais dias. Os dias habituais
-- existem só para o aviso "não veio no dia que costuma vir", que é aviso, não
-- falta. Medir dia fixo transformaria a aluna 3x mais assídua da academia em
-- faltosa crônica.
--
-- O QUE ESTA MIGRATION *NÃO* CRIA, porque já existe e está preenchido:
--
--   * meta semanal do plano — `academia_mensalidades.limite_dias_semana`. 156 das
--     418 mensalidades ativas da Estação têm 3. Não se recria.
--   * atribuição de passagem à aula — a regra de proximidade do início, de
--     20260828100000. Aqui ela vira a função `academia_turma_no_horario`, cópia
--     literal do predicado que já está dentro de `academia_relatorio_turmas`,
--     para que as telas novas concordem com a que já existe. `academia_relatorio_turmas`
--     NÃO foi tocada.
--   * dia fechado — `partner_feriados.fechado`.
--   * unidade de contagem (dia x entrada) — `partner_acesso_config.frequencia_conta`.
--
-- E o que auditei e NÃO serve, para ninguém confundir depois:
--   `partner_acesso_config.frequencia_meta` (= 10 na Estação) é meta de aulas
--   para PREMIAÇÃO, vitalícia, conforme o comentário da própria coluna em
--   20260813060000. Não é meta semanal. `frequencia_periodo` ('vitalicio') é o
--   reset desse contador de prêmio. `validacao_frequencia` ('catraca') é a FONTE
--   que vale como presença. Nenhuma das três responde "quantas vezes por semana
--   essa pessoa deveria vir".
--
-- A ARMADILHA QUE MANDA NESTE ARQUIVO: a catraca da Estação só tem passagens de
-- 26, 27 e 28/08/2026. Três dias. ZERO semanas completas. Um relatório de
-- constância ingênuo diria hoje que 408 pessoas estão sumindo, porque nenhuma
-- delas tem oito semanas de treino — não porque faltaram, mas porque o registro
-- não existe. `academia_sumidos` (20260828080000) já resolveu isso se recusando a
-- afirmar ausência sem histórico que a sustente; aqui a mesma prudência aparece
-- como a situação 'novo', que não acusa ninguém e some sozinha conforme a
-- catraca acumula semanas.

-- 1. Regime da academia ------------------------------------------------------
--
-- 'livre'   — ninguém é matriculado em turma. O sistema APRENDE o padrão de cada
--             pessoa pelas passagens e mede contra a meta do plano.
-- 'marcado' — a pessoa é matriculada em turma; falta é ausência numa aula em que
--             ela estava matriculada.
--
-- O default é 'livre' porque é o regime que não exige cadastro nenhum: uma
-- academia que nunca abrir esta tela continua tendo relatório.

ALTER TABLE public.partner_acesso_config
  ADD COLUMN IF NOT EXISTS regime_turma text NOT NULL DEFAULT 'livre';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_acesso_config_regime_turma_check') THEN
    ALTER TABLE public.partner_acesso_config
      ADD CONSTRAINT partner_acesso_config_regime_turma_check
      CHECK (regime_turma IN ('livre', 'marcado'));
  END IF;
END $$;

COMMENT ON COLUMN public.partner_acesso_config.regime_turma IS
  'livre: aluno treina na hora que quiser e a constância é medida contra a meta semanal do plano. marcado: aluno é matriculado em turma e falta é ausência na aula matriculada.';

-- 2. Matrícula ---------------------------------------------------------------
--
-- A metade que faltava: nada no banco ligava aluno a turma.
--
-- Obrigatória no regime marcado, opcional no livre — no livre ela serve para o
-- dono fixar a turma de quem ele SABE que é do horário das 6, em vez de esperar
-- o padrão ser aprendido.
--
-- A bifurcação credencial/aluno se repete no projeto inteiro: a pessoa existe
-- como credencial da catraca (413 na Estação) e/ou como aluno do app. A tabela
-- aceita os dois e exige ao menos um.

CREATE TABLE IF NOT EXISTS public.academia_turma_alunos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  turma_id uuid NOT NULL REFERENCES public.academia_turmas(id) ON DELETE CASCADE,
  credencial_id uuid REFERENCES public.academia_credenciais(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  desde date NOT NULL,
  ate date,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_turma_alunos_quem
    CHECK (credencial_id IS NOT NULL OR student_id IS NOT NULL),
  CONSTRAINT academia_turma_alunos_periodo
    CHECK (ate IS NULL OR ate >= desde)
);

-- `desde` não tem DEFAULT de propósito. CURRENT_DATE é a data em UTC: às 21h em
-- Cuiabá já é amanhã, e a matrícula nasceria valendo só no dia seguinte. Quem
-- insere manda a data local — a tela tem o fuso, o banco não tem como advinhar
-- de qual parceiro é a linha antes de ela existir.
COMMENT ON COLUMN public.academia_turma_alunos.desde IS
  'Data LOCAL da academia em que a matrícula passa a valer. Sem default: CURRENT_DATE é UTC e erraria o dia no fim da tarde.';

COMMENT ON TABLE public.academia_turma_alunos IS
  'Matrícula de aluno em turma. Obrigatória no regime marcado, opcional no livre.';

-- Uma matrícula aberta por pessoa por turma. Fechar (ate = <data>) e matricular
-- de novo continua permitido.
CREATE UNIQUE INDEX IF NOT EXISTS academia_turma_alunos_uma_aberta
  ON public.academia_turma_alunos (turma_id, COALESCE(credencial_id, student_id))
  WHERE ativo AND ate IS NULL;

CREATE INDEX IF NOT EXISTS academia_turma_alunos_turma_idx
  ON public.academia_turma_alunos (partner_id, turma_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS academia_turma_alunos_credencial_idx
  ON public.academia_turma_alunos (partner_id, credencial_id) WHERE credencial_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS academia_turma_alunos_student_idx
  ON public.academia_turma_alunos (partner_id, student_id) WHERE student_id IS NOT NULL;

ALTER TABLE public.academia_turma_alunos ENABLE ROW LEVEL SECURITY;

-- `TO authenticated` EXPLÍCITO. Sem ele o Postgres aplica a policy a PUBLIC, o
-- que inclui `anon` — foi assim que 413 credenciais vazaram em 28/08.
DROP POLICY IF EXISTS academia_turma_alunos_acesso ON public.academia_turma_alunos;
CREATE POLICY academia_turma_alunos_acesso ON public.academia_turma_alunos
  FOR ALL TO authenticated
  USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

REVOKE ALL ON public.academia_turma_alunos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academia_turma_alunos TO authenticated;
GRANT ALL ON public.academia_turma_alunos TO service_role;

-- 3. A aula de uma passagem --------------------------------------------------
--
-- Transcrição literal do predicado que já vive dentro de `academia_relatorio_turmas`
-- desde 20260828100000: a passagem vai para a aula cujo INÍCIO está mais perto,
-- dentro da tolerância, com a diferença medida de forma circular. Duas telas que
-- discordam sobre em qual aula alguém esteve é pior do que não ter a segunda
-- tela; por isso a regra é uma só, e esta função é ela.
--
-- SECURITY INVOKER de propósito: chamada de dentro das funções DEFINER abaixo
-- ela roda como o dono da tabela e enxerga a grade; chamada direto pelo cliente
-- ela passa pela RLS de `academia_turmas` e só enxerga a academia de quem chamou.

CREATE OR REPLACE FUNCTION public.academia_turma_no_horario(
  p_partner_id uuid,
  p_local_ts timestamp,
  p_tolerancia_min integer DEFAULT 30
)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $function$
  SELECT t.id
    FROM public.academia_turmas t
   WHERE t.partner_id = p_partner_id AND t.ativo
     AND t.hora_inicio IS NOT NULL
     AND (cardinality(t.dias_semana) = 0
       OR EXTRACT(DOW FROM p_local_ts)::smallint = ANY(t.dias_semana))
     AND LEAST(
           abs(EXTRACT(EPOCH FROM (p_local_ts::time - t.hora_inicio)) / 60),
           1440 - abs(EXTRACT(EPOCH FROM (p_local_ts::time - t.hora_inicio)) / 60)
         ) <= COALESCE(p_tolerancia_min, 30)
   ORDER BY LEAST(
              abs(EXTRACT(EPOCH FROM (p_local_ts::time - t.hora_inicio)) / 60),
              1440 - abs(EXTRACT(EPOCH FROM (p_local_ts::time - t.hora_inicio)) / 60)
            ), t.hora_inicio
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.academia_turma_no_horario(uuid, timestamp, integer) IS
  'Turma de uma passagem, pela proximidade do início da aula. Mesma regra de academia_relatorio_turmas.';

REVOKE EXECUTE ON FUNCTION public.academia_turma_no_horario(uuid, timestamp, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_turma_no_horario(uuid, timestamp, integer) TO authenticated, service_role;

-- 4. O padrão aprendido do aluno ---------------------------------------------
--
-- "uma forma de saber o normal que a pessoa vai, que ela mudou de horario, se
--  adaptar ao padrao do aluno"
--
-- Cortes, e por que cada um é esse:
--
--   SEMANA COMPLETA — só semanas segunda-a-domingo inteiramente cobertas pela
--   catraca entram na média. A semana em curso fica de fora do denominador
--   (aparece separada em `treinos_semana_atual`): incluí-la faria toda segunda
--   de manhã a academia inteira parecer em queda. Semana anterior ao primeiro
--   registro da catraca também fica de fora — não é ausência, é falta de dado.
--
--   DIA HABITUAL — o dia da semana entra quando a pessoa treinou nele em pelo
--   menos 60% das semanas em que ela apareceu. A aluna de seg/qua/sex numa
--   semana e seg/ter/qua na outra tem seg=100%, qua=100%, ter=50%, sex=50%: os
--   habituais são seg e qua, exatamente os dias em que a ausência dela quer
--   dizer alguma coisa. Um corte mais baixo listaria todo dia em que ela já
--   pisou na academia e o aviso viraria ruído.
--
--   META — `limite_dias_semana` do plano quando existe ('plano'). Lido como piso
--   esperado, não como teto: é a leitura do dono, "tem alunos que tem o plano de
--   3x na semana (...) se faltaram, ja fica o alerta". Nos planos Livre a coluna
--   é nula (262 das 418 mensalidades ativas da Estação) e aí a meta é o próprio
--   hábito da pessoa ('habito'): média de treinos por semana nas semanas
--   completas ANTERIORES às duas últimas, com no mínimo duas semanas dessas.
--   Excluir as duas últimas é o que faz a régua não descer junto com quem está
--   desanimando. Sem essas duas semanas a meta é nula ('sem_meta') e a pessoa
--   não é julgada.
--
--   MUDOU DE HORÁRIO — turma mais frequentada nos últimos 14 dias diferente da
--   das semanas anteriores, exigindo ao menos 2 passagens de cada lado. Uma
--   passagem sozinha em outro horário é a pessoa resolvendo o dia, não mudança
--   de rotina.
--
--   HORA MÉDIA / DESVIO — média linear dos minutos desde a meia-noite. Desvio
--   grande é o próprio sinal de "não tem horário fixo". Uma academia aberta
--   atravessando a meia-noite precisaria de média circular; nenhuma das duas é.

DROP FUNCTION IF EXISTS public.academia_padrao_do_aluno(uuid, integer);

CREATE FUNCTION public.academia_padrao_do_aluno(
  p_partner_id uuid,
  p_semanas integer DEFAULT 8
)
RETURNS TABLE(
  credencial_id uuid,
  student_id uuid,
  nome text,
  telefone text,
  treinos integer,
  dias_treinados integer,
  semanas_avaliadas integer,
  semanas_ativas integer,
  treinos_por_semana numeric,
  treinos_semana_atual integer,
  semanas_abaixo integer,
  turma_id uuid,
  turma text,
  turma_pct integer,
  hora_media time,
  hora_desvio_min integer,
  dias_semana smallint[],
  dias_rotulo text,
  meta_semanal integer,
  meta_origem text,
  mudou_horario boolean,
  turma_anterior_id uuid,
  turma_anterior text,
  primeiro_treino date,
  ultimo_treino date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz      text;
  v_tol     integer;
  v_conta   text;
  v_semanas integer;
  v_hoje    date;
  v_segunda date;   -- segunda-feira da semana em curso
  v_inicio  date;   -- segunda-feira que abre a janela
  v_fim     date;   -- domingo da última semana completa
  v_recorte date;   -- fronteira das "duas últimas semanas"
  v_desde   date;   -- primeiro dia com passagem nesta academia
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'),
         COALESCE(c.tolerancia_aula_min, 30),
         COALESCE(c.frequencia_conta, 'dia')
    INTO v_tz, v_tol, v_conta
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;

  v_tz      := COALESCE(v_tz, 'America/Sao_Paulo');
  v_tol     := COALESCE(v_tol, 30);
  v_conta   := COALESCE(v_conta, 'dia');
  v_semanas := LEAST(GREATEST(COALESCE(p_semanas, 8), 1), 52);

  v_hoje    := (now() AT TIME ZONE v_tz)::date;
  v_segunda := date_trunc('week', v_hoje::timestamp)::date;
  v_inicio  := v_segunda - (v_semanas * 7);
  v_fim     := v_segunda - 1;
  v_recorte := v_segunda - 14;

  SELECT min(f.entrada_em AT TIME ZONE v_tz)::date INTO v_desde
    FROM public.academia_frequencias f WHERE f.partner_id = p_partner_id;

  RETURN QUERY
  WITH
  -- Semanas completas que a catraca cobre. Vazio enquanto não houver uma semana
  -- inteira registrada — e é isso que segura o relatório de acusar todo mundo.
  grade AS (
    SELECT g.d::date AS semana
      FROM generate_series(v_inicio::timestamp, v_fim::timestamp, interval '7 days') g(d)
     WHERE v_desde IS NOT NULL AND g.d::date >= v_desde
  ),
  passagem AS (
    SELECT COALESCE(f.credencial_id::text, f.student_id::text) AS quem,
           f.credencial_id AS cred,
           f.student_id    AS stu,
           (f.entrada_em AT TIME ZONE v_tz) AS ts
      FROM public.academia_frequencias f
     WHERE f.partner_id = p_partner_id
       AND (f.entrada_em AT TIME ZONE v_tz)::date BETWEEN v_inicio AND v_hoje
  ),
  marcada AS (
    SELECT pa.quem, pa.cred, pa.stu, pa.ts,
           pa.ts::date AS dia,
           date_trunc('week', pa.ts)::date AS semana,
           EXTRACT(DOW FROM pa.ts)::smallint AS dow,
           (EXTRACT(HOUR FROM pa.ts) * 60 + EXTRACT(MINUTE FROM pa.ts))::numeric AS minuto,
           public.academia_turma_no_horario(p_partner_id, pa.ts, v_tol) AS aula
      FROM passagem pa
  ),
  pessoa AS (
    SELECT ma.quem,
           -- Não existe max(uuid). Dentro de um mesmo `quem` o par é constante,
           -- então qualquer não-nulo serve — e para `stu` isso ainda aproveita a
           -- passagem que trouxe o vínculo com o aluno do app.
           (array_agg(ma.cred) FILTER (WHERE ma.cred IS NOT NULL))[1] AS cred,
           (array_agg(ma.stu)  FILTER (WHERE ma.stu  IS NOT NULL))[1] AS stu,
           count(*)::integer AS passagens,
           count(DISTINCT ma.dia)::integer AS dias,
           count(DISTINCT ma.semana)::integer AS semanas_com_treino,
           avg(ma.minuto) AS media,
           COALESCE(stddev_samp(ma.minuto), 0) AS desvio,
           min(ma.dia) AS primeiro,
           max(ma.dia) AS ultimo,
           count(*) FILTER (WHERE ma.aula IS NOT NULL)::integer AS com_aula,
           count(DISTINCT ma.dia) FILTER (WHERE ma.semana = v_segunda)::integer AS na_semana
      FROM marcada ma
     GROUP BY ma.quem
  ),
  -- Treinos por semana, na unidade que a academia escolheu em frequencia_conta.
  semanal AS (
    SELECT ma.quem, ma.semana,
           (CASE WHEN v_conta = 'dia' THEN count(DISTINCT ma.dia) ELSE count(*) END)::integer AS treinos
      FROM marcada ma
     WHERE ma.dia BETWEEN v_inicio AND v_fim
     GROUP BY ma.quem, ma.semana
  ),
  -- Uma linha por (pessoa, semana completa) a partir da semana em que ela
  -- apareceu pela primeira vez. Semana sem treino entra como zero — não entrar
  -- inflaria a média de quem sumiu no meio da janela.
  serie AS (
    SELECT pe.quem, gr.semana, COALESCE(se.treinos, 0) AS treinos,
           row_number() OVER (PARTITION BY pe.quem ORDER BY gr.semana DESC) AS recencia
      FROM pessoa pe
      JOIN grade gr ON gr.semana >= date_trunc('week', pe.primeiro::timestamp)::date
      LEFT JOIN semanal se ON se.quem = pe.quem AND se.semana = gr.semana
  ),
  volume AS (
    SELECT sr.quem,
           count(*)::integer AS semanas_conta,
           sum(sr.treinos)::integer AS treinos_completos
      FROM serie sr GROUP BY sr.quem
  ),
  habito AS (
    SELECT sr.quem, GREATEST(round(avg(sr.treinos)), 1)::integer AS base
      FROM serie sr
     WHERE sr.semana < v_recorte
     GROUP BY sr.quem
    HAVING count(*) >= 2
  ),
  plano AS (
    SELECT DISTINCT ON (COALESCE(me.credencial_id::text, me.student_id::text))
           COALESCE(me.credencial_id::text, me.student_id::text) AS quem,
           me.limite_dias_semana AS limite
      FROM public.academia_mensalidades me
     WHERE me.partner_id = p_partner_id AND me.status = 'ativa'
     ORDER BY COALESCE(me.credencial_id::text, me.student_id::text),
              me.valido_ate DESC, me.created_at DESC
  ),
  meta AS (
    SELECT pe.quem,
           COALESCE(pl.limite, ha.base) AS valor,
           CASE WHEN pl.limite IS NOT NULL THEN 'plano'
                WHEN ha.base   IS NOT NULL THEN 'habito'
                ELSE 'sem_meta' END AS origem
      FROM pessoa pe
      LEFT JOIN plano  pl ON pl.quem = pe.quem
      LEFT JOIN habito ha ON ha.quem = pe.quem
  ),
  -- Semanas completas consecutivas, da mais recente para trás, abaixo da meta.
  abaixo AS (
    SELECT sr.quem,
           COALESCE(min(sr.recencia) FILTER (WHERE sr.treinos >= mt.valor) - 1,
                    count(*))::integer AS seguidas
      FROM serie sr JOIN meta mt ON mt.quem = sr.quem
     WHERE mt.valor IS NOT NULL
     GROUP BY sr.quem
  ),
  aula_conta AS (
    SELECT ma.quem, ma.aula, count(*)::integer AS vezes
      FROM marcada ma WHERE ma.aula IS NOT NULL
     GROUP BY ma.quem, ma.aula
  ),
  aula_top AS (
    SELECT DISTINCT ON (ac.quem) ac.quem, ac.aula, ac.vezes
      FROM aula_conta ac JOIN public.academia_turmas tu ON tu.id = ac.aula
     ORDER BY ac.quem, ac.vezes DESC, tu.hora_inicio
  ),
  recente AS (
    SELECT DISTINCT ON (ma.quem) ma.quem, ma.aula, count(*)::integer AS vezes
      FROM marcada ma JOIN public.academia_turmas tu ON tu.id = ma.aula
     WHERE ma.dia > v_hoje - 14
     GROUP BY ma.quem, ma.aula, tu.hora_inicio
     ORDER BY ma.quem, count(*) DESC, tu.hora_inicio
  ),
  anterior AS (
    SELECT DISTINCT ON (ma.quem) ma.quem, ma.aula, count(*)::integer AS vezes
      FROM marcada ma JOIN public.academia_turmas tu ON tu.id = ma.aula
     WHERE ma.dia <= v_hoje - 14
     GROUP BY ma.quem, ma.aula, tu.hora_inicio
     ORDER BY ma.quem, count(*) DESC, tu.hora_inicio
  ),
  dow_conta AS (
    SELECT ma.quem, ma.dow, count(DISTINCT ma.dia)::integer AS vezes
      FROM marcada ma GROUP BY ma.quem, ma.dow
  ),
  dow_habitual AS (
    SELECT dc.quem, array_agg(dc.dow ORDER BY dc.dow)::smallint[] AS dias
      FROM dow_conta dc JOIN pessoa pe ON pe.quem = dc.quem
     WHERE dc.vezes >= ceil(0.6 * GREATEST(pe.semanas_com_treino, 1))
     GROUP BY dc.quem
  )
  SELECT pe.cred,
         pe.stu,
         COALESCE(pr.name, cr.nome_no_equipamento, 'Sem nome')::text,
         NULLIF(trim(COALESCE(pr.phone, cr.telefone, '')), '')::text,
         pe.passagens,
         pe.dias,
         COALESCE(vo.semanas_conta, 0),
         pe.semanas_com_treino,
         CASE WHEN COALESCE(vo.semanas_conta, 0) = 0 THEN NULL
              ELSE round(vo.treinos_completos::numeric / vo.semanas_conta, 2) END,
         pe.na_semana,
         ab.seguidas,
         tp.aula,
         tu.nome::text,
         CASE WHEN pe.com_aula = 0 THEN NULL
              ELSE round(100.0 * tp.vezes / pe.com_aula)::integer END,
         (time '00:00' + make_interval(mins => round(pe.media)::integer)),
         round(pe.desvio)::integer,
         dh.dias,
         public.dias_semana_rotulo(dh.dias),
         mt.valor,
         mt.origem,
         (re.aula IS NOT NULL AND an.aula IS NOT NULL AND re.aula <> an.aula
          AND re.vezes >= 2 AND an.vezes >= 2),
         an.aula,
         ta.nome::text,
         pe.primeiro,
         pe.ultimo
    FROM pessoa pe
    LEFT JOIN volume  vo ON vo.quem = pe.quem
    LEFT JOIN meta    mt ON mt.quem = pe.quem
    LEFT JOIN abaixo  ab ON ab.quem = pe.quem
    LEFT JOIN aula_top tp ON tp.quem = pe.quem
    LEFT JOIN public.academia_turmas tu ON tu.id = tp.aula
    LEFT JOIN recente  re ON re.quem = pe.quem
    LEFT JOIN anterior an ON an.quem = pe.quem
    LEFT JOIN public.academia_turmas ta ON ta.id = an.aula
    LEFT JOIN dow_habitual dh ON dh.quem = pe.quem
    LEFT JOIN public.academia_credenciais cr ON cr.id = pe.cred
    LEFT JOIN public.students s  ON s.id = pe.stu
    LEFT JOIN public.profiles pr ON pr.id = s.profile_id
   ORDER BY pe.passagens DESC, 3;
END;
$function$;

COMMENT ON FUNCTION public.academia_padrao_do_aluno(uuid, integer) IS
  'Padrão aprendido de cada pessoa que treinou na janela: turma habitual, horário médio, dias habituais, treinos por semana, meta e mudança de horário.';

REVOKE EXECUTE ON FUNCTION public.academia_padrao_do_aluno(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_padrao_do_aluno(uuid, integer) TO authenticated, service_role;

-- 5. Constância --------------------------------------------------------------
--
-- "dar relatorio de constancia dessas pessoas, quem faltou, quantidades de
--  faltas para a gente ver quem pode estar desanimado, faltando muito, sem
--  aparecer"
--
-- Lê `academia_padrao_do_aluno` em vez de recalcular: duas telas que discordam
-- sobre a turma habitual da mesma pessoa não têm conserto depois.
--
-- A lista é a MENSALIDADE ATIVA, não quem treinou — quem não aparece é
-- justamente quem o dono quer ver. Quem treinou sem mensalidade ativa entra
-- também, senão sumiria do relatório por um problema de cadastro.
--
-- As faixas, em ordem de precedência, e o corte de cada uma:
--
--   'novo'      Não dá para julgar. Três gatilhos: a academia não tem uma semana
--               completa de catraca; ou a pessoa tem menos de 2 semanas completas
--               medidas; ou não há meta (plano Livre e histórico curto demais
--               para virar hábito). Não é elogio nem acusação — é o banco
--               dizendo que ainda não sabe. Hoje, na Estação, é a faixa de todo
--               mundo, e ela se esvazia sozinha conforme a catraca acumula
--               semanas. Sem essa faixa, a estreia da tela seria 408 pessoas
--               marcadas como faltosas por um histórico de três dias.
--
--   'sumiu'     `dias_sumido` (60, da config, o mesmo corte de `academia_sumidos`)
--               sem passar na catraca. Só vale quando a catraca TEM 60 dias de
--               histórico: antes disso ninguém está provadamente sumido.
--
--   'sumindo'   Sem treinar por 3x o intervalo esperado dela, com piso de 7 dias,
--               E com ao menos uma semana completa abaixo da meta.
--               Quem tem meta 3 treina a cada ~2,3 dias; 3 intervalos são 9 dias,
--               ou umas 4 aulas seguidas perdidas. O piso de 7 impede que a meta
--               6x/semana vire alerta na quarta-feira. O mesmo teste de histórico
--               do 'sumiu' se aplica: não se afirma ausência maior que o registro.
--
--               A EXIGÊNCIA DE `semanas_abaixo >= 1` NÃO É DECORAÇÃO — sem ela a
--               faixa acusa exatamente quem o dono mandou proteger. A aluna de
--               3x/semana que faz seg/qua/sex numa semana e seg/ter/qua na outra
--               fecha a semana numa quarta; no sábado seguinte ela está há 10
--               dias sem treinar e cai no corte de 9, apesar de 100% de
--               aderência e zero semanas abaixo da meta. Medido em simulação de
--               8 semanas: ela era classificada 'sumindo'. O relógio de recência
--               sozinho não sabe a diferença entre "sumiu" e "a semana dela
--               acabou cedo" — quem está batendo a meta toda semana, por
--               definição, não está sumindo. O alarme de recência só vale
--               corroborado pelo ritmo semanal, que é a régua que o dono pediu.
--
--   'caindo'    2 semanas completas SEGUIDAS abaixo da meta. Uma semana ruim é
--               viagem, gripe, prova. Duas seguidas é tendência — é aqui que
--               mora o "pode estar desanimado" que o dono quer alcançar antes do
--               cancelamento.
--
--   'constante' O resto: bateu a meta em pelo menos uma das duas últimas semanas
--               completas e está aparecendo dentro do ritmo dela.
--
-- `situacao_ordem` sai como coluna para a tela ordenar pelo pior primeiro sem
-- ter que codificar a régua de novo em TypeScript.

DROP FUNCTION IF EXISTS public.academia_constancia(uuid, integer);

CREATE FUNCTION public.academia_constancia(
  p_partner_id uuid,
  p_semanas integer DEFAULT 8
)
RETURNS TABLE(
  credencial_id uuid,
  student_id uuid,
  nome text,
  telefone text,
  meta_semanal integer,
  meta_origem text,
  treinos_por_semana numeric,
  treinos_semana_atual integer,
  aderencia integer,
  semanas_avaliadas integer,
  semanas_abaixo integer,
  dias_sem_treinar integer,
  ultimo_treino date,
  turma_id uuid,
  turma text,
  mudou_horario boolean,
  situacao text,
  situacao_ordem smallint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz        text;
  v_semanas   integer;
  v_sumido    integer;
  v_hoje      date;
  v_desde     date;
  v_historico integer;   -- dias de catraca disponíveis
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'), COALESCE(c.dias_sumido, 60)
    INTO v_tz, v_sumido
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;

  v_tz      := COALESCE(v_tz, 'America/Sao_Paulo');
  v_sumido  := COALESCE(v_sumido, 60);
  v_semanas := LEAST(GREATEST(COALESCE(p_semanas, 8), 1), 52);
  v_hoje    := (now() AT TIME ZONE v_tz)::date;

  SELECT min(f.entrada_em AT TIME ZONE v_tz)::date INTO v_desde
    FROM public.academia_frequencias f WHERE f.partner_id = p_partner_id;

  v_historico := COALESCE(v_hoje - v_desde, 0);

  RETURN QUERY
  WITH
  padrao AS (
    SELECT pd.*, COALESCE(pd.credencial_id::text, pd.student_id::text) AS quem
      FROM public.academia_padrao_do_aluno(p_partner_id, v_semanas) pd
  ),
  matricula AS (
    SELECT DISTINCT ON (COALESCE(me.credencial_id::text, me.student_id::text))
           COALESCE(me.credencial_id::text, me.student_id::text) AS quem,
           me.credencial_id AS cred, me.student_id AS stu, me.limite_dias_semana AS limite
      FROM public.academia_mensalidades me
     WHERE me.partner_id = p_partner_id AND me.status = 'ativa'
     ORDER BY COALESCE(me.credencial_id::text, me.student_id::text),
              me.valido_ate DESC, me.created_at DESC
  ),
  todos AS (
    SELECT COALESCE(pd.quem, ma.quem) AS quem,
           COALESCE(pd.credencial_id, ma.cred) AS cred,
           COALESCE(pd.student_id, ma.stu) AS stu,
           pd.nome, pd.telefone,
           COALESCE(pd.meta_semanal, ma.limite) AS meta,
           CASE WHEN pd.meta_origem IS NOT NULL THEN pd.meta_origem
                WHEN ma.limite IS NOT NULL THEN 'plano'
                ELSE 'sem_meta' END AS origem,
           pd.treinos_por_semana, pd.treinos_semana_atual,
           COALESCE(pd.semanas_avaliadas, 0) AS semanas_avaliadas,
           pd.semanas_abaixo, pd.ultimo_treino,
           pd.turma_id, pd.turma, COALESCE(pd.mudou_horario, false) AS mudou
      FROM padrao pd
      FULL OUTER JOIN matricula ma ON ma.quem = pd.quem
  ),
  medido AS (
    SELECT td.*,
           -- Quem nunca apareceu não "sumiu há mil dias": sumiu, no máximo, há
           -- tanto tempo quanto a catraca existe.
           COALESCE(v_hoje - td.ultimo_treino, v_historico) AS parado,
           CASE WHEN td.meta IS NULL OR td.meta = 0 THEN NULL
                ELSE GREATEST(3 * ceil(7.0 / td.meta)::integer, 7) END AS corte_sumindo
      FROM todos td
  )
  SELECT me.cred,
         me.stu,
         COALESCE(me.nome, pr.name, cr.nome_no_equipamento, 'Sem nome')::text,
         COALESCE(me.telefone, NULLIF(trim(COALESCE(pr.phone, cr.telefone, '')), ''))::text,
         me.meta,
         me.origem,
         COALESCE(me.treinos_por_semana, 0),
         COALESCE(me.treinos_semana_atual, 0),
         CASE WHEN me.meta IS NULL OR me.meta = 0 OR me.semanas_avaliadas = 0 THEN NULL
              ELSE round(100.0 * COALESCE(me.treinos_por_semana, 0) / me.meta)::integer END,
         me.semanas_avaliadas,
         COALESCE(me.semanas_abaixo, 0),
         me.parado,
         me.ultimo_treino,
         me.turma_id,
         me.turma,
         me.mudou,
         s.rotulo,
         o.ordem
    FROM medido me
    LEFT JOIN public.academia_credenciais cr ON cr.id = me.cred
    LEFT JOIN public.students st ON st.id = me.stu
    LEFT JOIN public.profiles pr ON pr.id = st.profile_id
    -- A faixa sai de UM lugar só e a ordem é derivada dela, para a régua não
    -- poder divergir de si mesma entre a cor do chip e a ordenação da lista.
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN me.semanas_avaliadas < 2 OR me.meta IS NULL           THEN 'novo'
               WHEN me.parado >= v_sumido AND v_historico >= v_sumido     THEN 'sumiu'
               WHEN me.parado >= me.corte_sumindo
                AND v_historico >= me.corte_sumindo
                AND COALESCE(me.semanas_abaixo, 0) >= 1                   THEN 'sumindo'
               WHEN COALESCE(me.semanas_abaixo, 0) >= 2                   THEN 'caindo'
               ELSE 'constante'
             END AS rotulo
    ) s
    CROSS JOIN LATERAL (
      SELECT (CASE s.rotulo WHEN 'sumiu'   THEN 1 WHEN 'sumindo' THEN 2
                            WHEN 'caindo'  THEN 3 WHEN 'novo'    THEN 4
                            ELSE 5 END)::smallint AS ordem
    ) o
   ORDER BY o.ordem, me.parado DESC, 3;
END;
$function$;

COMMENT ON FUNCTION public.academia_constancia(uuid, integer) IS
  'Constância por pessoa: meta semanal, treinos por semana, aderência, semanas seguidas abaixo, dias parado e situação (novo/sumiu/sumindo/caindo/constante).';

REVOKE EXECUTE ON FUNCTION public.academia_constancia(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_constancia(uuid, integer) TO authenticated, service_role;

-- 6. Faltas ------------------------------------------------------------------
--
-- A mesma função responde nos dois regimes, lendo `regime_turma`:
--
--   MARCADO — uma linha por aula em que a pessoa estava matriculada e não passou
--   na catraca. A aula precisa ter acontecido: aula de hoje às 19:30 só vira
--   falta depois das 20:30. `faltas` = 1.
--
--   LIVRE — uma linha por semana completa em que a pessoa ficou abaixo da meta.
--   `faltas` = quantos treinos faltaram para a meta. Aqui NÃO se olha dia da
--   semana: a aluna de seg/qua/sex numa semana e seg/ter/qua na outra fez 3 nas
--   duas e não faltou nenhuma vez.
--
-- Dia com `partner_feriados.fechado` nunca gera falta em nenhum dos dois. No
-- livre ele ainda encolhe a meta da semana: se a academia abriu 2 dias naquela
-- semana, a meta de 3 vira 2 — cobrar 3 de uma semana com 2 dias úteis é cobrar
-- o impossível.
--
-- E, como no resto do arquivo: dia anterior ao primeiro registro da catraca não
-- gera falta. Não existe ausência antes de existir registro.

DROP FUNCTION IF EXISTS public.academia_faltas(uuid, date, date);

CREATE FUNCTION public.academia_faltas(
  p_partner_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL
)
RETURNS TABLE(
  credencial_id uuid,
  student_id uuid,
  nome text,
  telefone text,
  regime text,
  referencia date,
  dia_semana smallint,
  turma_id uuid,
  turma text,
  horario time,
  faltas integer,
  meta_semanal integer,
  treinos integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz     text;
  v_tol    integer;
  v_conta  text;
  v_regime text;
  v_hoje   date;
  v_agora  time;
  v_de     date;
  v_ate    date;
  v_desde  date;
  v_dows   smallint[];   -- dias da semana em que a academia tem aula
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'),
         COALESCE(c.tolerancia_aula_min, 30),
         COALESCE(c.frequencia_conta, 'dia'),
         COALESCE(c.regime_turma, 'livre')
    INTO v_tz, v_tol, v_conta, v_regime
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;

  v_tz     := COALESCE(v_tz, 'America/Sao_Paulo');
  v_tol    := COALESCE(v_tol, 30);
  v_conta  := COALESCE(v_conta, 'dia');
  v_regime := COALESCE(v_regime, 'livre');

  v_hoje  := (now() AT TIME ZONE v_tz)::date;
  v_agora := (now() AT TIME ZONE v_tz)::time;
  v_de    := COALESCE(p_de, date_trunc('week', v_hoje::timestamp)::date - 28);
  v_ate   := LEAST(COALESCE(p_ate, v_hoje), v_hoje);

  SELECT min(f.entrada_em AT TIME ZONE v_tz)::date INTO v_desde
    FROM public.academia_frequencias f WHERE f.partner_id = p_partner_id;

  IF v_desde IS NULL THEN RETURN; END IF;
  v_de := GREATEST(v_de, v_desde);

  SELECT array_agg(DISTINCT d)::smallint[] INTO v_dows
    FROM public.academia_turmas t,
         unnest(CASE WHEN cardinality(t.dias_semana) = 0
                     THEN ARRAY[0,1,2,3,4,5,6]::smallint[] ELSE t.dias_semana END) d
   WHERE t.partner_id = p_partner_id AND t.ativo;

  IF v_regime = 'marcado' THEN
    RETURN QUERY
    WITH dia_aberto AS (
      SELECT g.d::date AS data, EXTRACT(DOW FROM g.d)::smallint AS dow
        FROM generate_series(v_de::timestamp, v_ate::timestamp, interval '1 day') g(d)
       WHERE NOT EXISTS (
         SELECT 1 FROM public.partner_feriados fe
          WHERE fe.partner_id = p_partner_id AND fe.data = g.d::date AND fe.fechado)
    ),
    aula AS (
      SELECT ta.credencial_id AS cred, ta.student_id AS stu,
             tu.id AS t_id, tu.nome AS t_nome, tu.hora_inicio, tu.hora_fim,
             da.data, da.dow
        FROM public.academia_turma_alunos ta
        JOIN public.academia_turmas tu ON tu.id = ta.turma_id AND tu.ativo
        JOIN dia_aberto da
          ON (cardinality(tu.dias_semana) = 0 OR da.dow = ANY(tu.dias_semana))
       WHERE ta.partner_id = p_partner_id AND ta.ativo
         AND tu.hora_inicio IS NOT NULL
         AND da.data >= ta.desde AND (ta.ate IS NULL OR da.data <= ta.ate)
         -- a aula já tem que ter terminado
         AND (da.data < v_hoje
              OR v_agora >= COALESCE(tu.hora_fim, tu.hora_inicio + make_interval(mins => v_tol)))
    )
    SELECT au.cred, au.stu,
           COALESCE(pr.name, cr.nome_no_equipamento, 'Sem nome')::text,
           NULLIF(trim(COALESCE(pr.phone, cr.telefone, '')), '')::text,
           'marcado'::text, au.data, au.dow, au.t_id, au.t_nome::text, au.hora_inicio,
           1, NULL::integer, NULL::integer
      FROM aula au
      LEFT JOIN public.academia_credenciais cr ON cr.id = au.cred
      LEFT JOIN public.students st ON st.id = au.stu
      LEFT JOIN public.profiles pr ON pr.id = st.profile_id
     WHERE NOT EXISTS (
       SELECT 1 FROM public.academia_frequencias f
        WHERE f.partner_id = p_partner_id
          AND (f.entrada_em AT TIME ZONE v_tz)::date = au.data
          AND (f.credencial_id = au.cred
            OR (au.cred IS NULL AND au.stu IS NOT NULL AND f.student_id = au.stu))
          AND public.academia_turma_no_horario(
                p_partner_id, (f.entrada_em AT TIME ZONE v_tz), v_tol) = au.t_id)
     ORDER BY au.data DESC, au.hora_inicio, 3;
    RETURN;
  END IF;

  -- Regime livre
  RETURN QUERY
  WITH grade AS (
    SELECT g.d::date AS semana
      FROM generate_series(date_trunc('week', v_de::timestamp),
                           date_trunc('week', v_ate::timestamp), interval '7 days') g(d)
     WHERE g.d::date >= v_de                       -- semana inteira dentro do pedido
       AND g.d::date >= v_desde                    -- e inteira coberta pela catraca
       AND g.d::date + 6 <= LEAST(v_ate, v_hoje - 1)
  ),
  -- Meta da semana encolhida pelos dias em que a academia esteve fechada.
  semana_meta AS (
    SELECT gr.semana, count(*)::integer AS dias_abertos
      FROM grade gr CROSS JOIN generate_series(0, 6) i
     WHERE (v_dows IS NULL OR EXTRACT(DOW FROM gr.semana + i)::smallint = ANY(v_dows))
       AND NOT EXISTS (
         SELECT 1 FROM public.partner_feriados fe
          WHERE fe.partner_id = p_partner_id AND fe.data = gr.semana + i AND fe.fechado)
     GROUP BY gr.semana
  ),
  plano AS (
    SELECT DISTINCT ON (COALESCE(me.credencial_id::text, me.student_id::text))
           COALESCE(me.credencial_id::text, me.student_id::text) AS quem,
           me.credencial_id AS cred, me.student_id AS stu, me.limite_dias_semana AS limite
      FROM public.academia_mensalidades me
     WHERE me.partner_id = p_partner_id AND me.status = 'ativa'
       AND me.limite_dias_semana IS NOT NULL
     ORDER BY COALESCE(me.credencial_id::text, me.student_id::text),
              me.valido_ate DESC, me.created_at DESC
  ),
  feito AS (
    SELECT COALESCE(f.credencial_id::text, f.student_id::text) AS quem,
           date_trunc('week', (f.entrada_em AT TIME ZONE v_tz))::date AS semana,
           (CASE WHEN v_conta = 'dia'
                 THEN count(DISTINCT (f.entrada_em AT TIME ZONE v_tz)::date)
                 ELSE count(*) END)::integer AS treinos
      FROM public.academia_frequencias f
     WHERE f.partner_id = p_partner_id
       AND (f.entrada_em AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
     GROUP BY 1, 2
  )
  SELECT pl.cred, pl.stu,
         COALESCE(pr.name, cr.nome_no_equipamento, 'Sem nome')::text,
         NULLIF(trim(COALESCE(pr.phone, cr.telefone, '')), '')::text,
         'livre'::text, sm.semana, NULL::smallint, NULL::uuid, NULL::text, NULL::time,
         (LEAST(pl.limite, sm.dias_abertos) - COALESCE(fe.treinos, 0))::integer,
         LEAST(pl.limite, sm.dias_abertos)::integer,
         COALESCE(fe.treinos, 0)::integer
    FROM plano pl
    CROSS JOIN semana_meta sm
    LEFT JOIN feito fe ON fe.quem = pl.quem AND fe.semana = sm.semana
    LEFT JOIN public.academia_credenciais cr ON cr.id = pl.cred
    LEFT JOIN public.students st ON st.id = pl.stu
    LEFT JOIN public.profiles pr ON pr.id = st.profile_id
   WHERE COALESCE(fe.treinos, 0) < LEAST(pl.limite, sm.dias_abertos)
   ORDER BY sm.semana DESC, 11 DESC, 3;
END;
$function$;

COMMENT ON FUNCTION public.academia_faltas(uuid, date, date) IS
  'Faltas nos dois regimes: no marcado, aula matriculada sem passagem; no livre, semana completa abaixo da meta do plano. Dia fechado nunca vira falta.';

REVOKE EXECUTE ON FUNCTION public.academia_faltas(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_faltas(uuid, date, date) TO authenticated, service_role;

-- 7. academia_frequencias.turma_id continua morta ----------------------------
--
-- A coluna existe e está NULL nas 210 passagens da Estação. NÃO foi preenchida
-- retroativamente, de propósito: `academia_relatorio_turmas` deduz a aula em
-- tempo de consulta e não lê a coluna, então preenchê-la não mudaria nenhuma
-- tela e só criaria uma segunda verdade para divergir da primeira. No regime
-- marcado, quando fizer sentido gravar a aula no momento da passagem, o lugar é
-- o caminho de INSERT do agente — não um UPDATE em massa em cima de histórico.
