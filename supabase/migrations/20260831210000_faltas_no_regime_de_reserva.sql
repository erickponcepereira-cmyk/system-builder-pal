-- Faltas no regime de reserva.
--
-- `academia_faltas` nasceu com dois regimes, porque só existiam dois: MARCADO
-- (matrícula fixa em turma, falta = aula matriculada sem passagem) e LIVRE
-- (falta = semana completa abaixo da meta do plano). Em 31/08 entrou o
-- terceiro, RESERVA, e a função não sabe dele: cai no ELSE e responde pela
-- régua do livre.
--
-- Isso não é um detalhe de rótulo. Numa academia de reserva a ausência é um
-- FATO REGISTRADO, não uma inferência: a pessoa disse que vinha, a vaga ficou
-- guardada, ela não apareceu, e `academia_fechar_faltas` gravou
-- `academia_reservas.status = 'faltou'`. Responder por semana-abaixo-da-meta
-- joga fora o dado exato e devolve uma estimativa no lugar dele — e ainda por
-- cima uma que depende de `limite_dias_semana`, que numa academia de reserva
-- muitas vezes nem está preenchido. O resultado prático seria uma tela de
-- faltas vazia numa academia que teve faltas.
--
-- A OUTRA METADE DO CONSERTO, E A MENOS ÓBVIA: a regra "não existe ausência
-- antes de existir registro" (`v_desde`, o primeiro dia com passagem na
-- catraca) vale para marcado e para livre, onde a falta é DEDUZIDA da ausência
-- de passagem — sem histórico, deduzir seria inventar. Ela não vale para
-- reserva. Ali a falta não é deduzida de nada: está gravada. Uma pessoa pode
-- reservar e não aparecer na primeira aula da vida da academia, antes de
-- qualquer QR ter sido lido, e essa falta é real. Por isso o ramo da reserva
-- vem ANTES do guard de `v_desde` e não é recortado por ele.
--
-- Nada mais muda: marcado e livre continuam byte a byte o que eram.

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

  -- Regime reserva ------------------------------------------------------------
  --
  -- Uma linha por vaga guardada que ninguém ocupou. Quem cancelou não falta —
  -- cancelar é justamente o oposto de faltar, e é o comportamento que a
  -- academia quer premiar, não punir: a vaga voltou para a fila a tempo.
  --
  -- Antes do guard de `v_desde` de propósito. Ver o cabeçalho da migration.
  IF v_regime = 'reserva' THEN
    RETURN QUERY
    SELECT r.credencial_id,
           r.student_id,
           COALESCE(pr.name, cr.nome_no_equipamento, 'Sem nome')::text,
           NULLIF(trim(COALESCE(pr.phone, cr.telefone, '')), '')::text,
           'reserva'::text,
           r.data,
           r.dia_semana,
           r.turma_id,
           tu.nome::text,
           tu.hora_inicio,
           1,
           NULL::integer,
           NULL::integer
      FROM public.academia_reservas r
      JOIN public.academia_turmas tu ON tu.id = r.turma_id
      LEFT JOIN public.academia_credenciais cr ON cr.id = r.credencial_id
      LEFT JOIN public.students st ON st.id = r.student_id
      LEFT JOIN public.profiles pr ON pr.id = st.profile_id
     WHERE r.partner_id = p_partner_id
       AND r.status = 'faltou'
       AND r.data BETWEEN v_de AND v_ate
     ORDER BY r.data DESC, tu.hora_inicio, 3;
    RETURN;
  END IF;

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
  'Faltas nos tres regimes: reserva (vaga guardada e ninguem apareceu), marcado (aula matriculada sem passagem) e livre (semana completa abaixo da meta do plano). Dia fechado nunca vira falta.';

REVOKE EXECUTE ON FUNCTION public.academia_faltas(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_faltas(uuid, date, date) TO authenticated, service_role;
