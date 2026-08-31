-- Reserva de aula e QR da mensalidade.
--
-- A academia do Jean não tem catraca: o aluno reserva a aula pelo aplicativo
-- (é daí que sai a previsibilidade que ele quer) e, ao chegar, mostra o QR da
-- mensalidade, que é o que libera e diz se ele está em dia.
--
-- POR QUE NÃO REUSEI `partner_freebie_reservations`.
-- Ela existe, funciona e faz quase isto: slot, capacidade, `qr_token`,
-- `redeem`. Mas ela é ancorada em `partner_products` com
-- `partner_product_schedules` — a grade de uma AULA GRATUITA de divulgação. A
-- grade da academia mora em `academia_turmas`, com `dias_semana` e
-- `hora_inicio`, e a reserva precisa checar mensalidade, alimentar
-- `academia_frequencias` e virar falta em `academia_faltas`. Forçar a aula da
-- academia dentro do modelo de produto gratuito distorceria as duas pontas.
-- O que eu REUSO é a forma: token de 32 hex por `gen_random_uuid()`, trava
-- `FOR UPDATE` antes de contar vaga, reserva idempotente devolvendo o mesmo
-- token. Quem já leu o código do freebie reconhece este aqui.
--
-- O QR É DA PESSOA, NÃO DA RESERVA. Foi o que o dono descreveu: "mostrar o qr
-- code da mensalidade". Um código estável por credencial, que ele mostra todo
-- dia. A reserva é outra coisa — ela diz que ele vem; o QR diz que ele pode.
-- Se o QR fosse por reserva, quem esqueceu de reservar não entraria nem
-- estando em dia, e a recepção teria que resolver na mão toda vez.

-- ---------------------------------------------------------------------------
-- 1. A grade ganha capacidade, e a academia ganha o regime de reserva.
-- ---------------------------------------------------------------------------

ALTER TABLE public.academia_turmas
  ADD COLUMN IF NOT EXISTS capacidade smallint;

COMMENT ON COLUMN public.academia_turmas.capacidade IS
  'Quantas pessoas cabem na aula. NULL = sem limite, que é o caso de academia de treino livre.';

-- Três regimes, porque são três realidades diferentes de verdade:
--   livre    a pessoa treina quando quer; a régua é quantos treinos na semana
--   marcado  a pessoa é matriculada numa turma fixa; falta é não aparecer nela
--   reserva  a pessoa reserva cada aula; falta é reservar e não aparecer
ALTER TABLE public.partner_acesso_config
  DROP CONSTRAINT IF EXISTS partner_acesso_config_regime_turma_check;

ALTER TABLE public.partner_acesso_config
  ADD CONSTRAINT partner_acesso_config_regime_turma_check
  CHECK (regime_turma = ANY (ARRAY['livre'::text, 'marcado'::text, 'reserva'::text]));

-- ---------------------------------------------------------------------------
-- 2. O QR da pessoa.
-- ---------------------------------------------------------------------------
--
-- Token aleatório, e não o `id` da credencial: o id aparece em log, em URL e em
-- resposta de API, e um QR que é o id transforma qualquer vazamento de id em
-- vazamento de acesso. O token só existe para isto e pode ser trocado sozinho
-- se alguém tirar foto do crachá de outro.
ALTER TABLE public.academia_credenciais
  ADD COLUMN IF NOT EXISTS qr_token text;

UPDATE public.academia_credenciais
   SET qr_token = replace(gen_random_uuid()::text, '-', '')
 WHERE qr_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS academia_credenciais_qr_token_uk
  ON public.academia_credenciais (qr_token) WHERE qr_token IS NOT NULL;

COMMENT ON COLUMN public.academia_credenciais.qr_token IS
  'Código do QR da mensalidade. Aleatório de proposito: o id da credencial vaza em log e URL, o token nao.';

-- ---------------------------------------------------------------------------
-- 3. Quem sou eu, sem consultar `profiles` de dentro de policy.
-- ---------------------------------------------------------------------------
--
-- A policy da tabela abaixo precisa do profile do usuário logado. Consultar
-- `profiles` direto de dentro de uma policy é proibido neste projeto — sem
-- grant, o Postgres recusa a leitura inteira, e foi assim que um revoke em
-- `partners` derrubou o login de todos os parceiros em 22/08. SECURITY DEFINER
-- resolve. Vem ANTES da tabela porque a policy referencia esta função: criar na
-- ordem inversa faz o CREATE POLICY falhar com "function does not exist".
CREATE OR REPLACE FUNCTION public.meu_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1;
$fn$;

REVOKE EXECUTE ON FUNCTION public.meu_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_profile_id() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. As reservas.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.academia_reservas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id     uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  turma_id       uuid NOT NULL REFERENCES public.academia_turmas(id) ON DELETE CASCADE,
  credencial_id  uuid REFERENCES public.academia_credenciais(id) ON DELETE CASCADE,
  student_id     uuid REFERENCES public.students(id) ON DELETE CASCADE,
  profile_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  data           date NOT NULL,
  inicio         timestamptz NOT NULL,
  fim            timestamptz NOT NULL,
  dia_semana     smallint NOT NULL,
  status         text NOT NULL DEFAULT 'reservada',
  origem         text NOT NULL DEFAULT 'aluno',
  reservada_em   timestamptz NOT NULL DEFAULT now(),
  presente_em    timestamptz,
  cancelada_em   timestamptz,
  frequencia_id  uuid REFERENCES public.academia_frequencias(id) ON DELETE SET NULL,
  CONSTRAINT academia_reservas_status_check
    CHECK (status = ANY (ARRAY['reservada'::text, 'presente'::text, 'faltou'::text, 'cancelada'::text])),
  CONSTRAINT academia_reservas_origem_check
    CHECK (origem = ANY (ARRAY['aluno'::text, 'recepcao'::text])),
  -- A mesma bifurcação de todo o resto do projeto: a pessoa pode existir só
  -- como credencial do leitor, ou como aluno da plataforma.
  CONSTRAINT academia_reservas_tem_dono
    CHECK (credencial_id IS NOT NULL OR student_id IS NOT NULL)
);

-- Uma pessoa não ocupa duas vagas da mesma aula. Cancelada não conta, senão
-- quem desiste e se arrepende fica trancado para sempre.
CREATE UNIQUE INDEX IF NOT EXISTS academia_reservas_uma_por_aula
  ON public.academia_reservas (turma_id, data, COALESCE(credencial_id, student_id))
  WHERE status IN ('reservada', 'presente');

CREATE INDEX IF NOT EXISTS academia_reservas_do_dia
  ON public.academia_reservas (partner_id, data) WHERE status <> 'cancelada';

ALTER TABLE public.academia_reservas ENABLE ROW LEVEL SECURITY;

-- A academia enxerga as reservas dela.
DROP POLICY IF EXISTS academia_reservas_academia ON public.academia_reservas;
CREATE POLICY academia_reservas_academia ON public.academia_reservas
  FOR ALL TO authenticated
  USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- E o aluno enxerga as DELE, em qualquer academia. Sem esta, o aluno não
-- consegue nem listar o que reservou. `profile_id` é comparado contra o perfil
-- do próprio `auth.uid()`; não há consulta a `profiles` que dependa de RLS
-- porque a política lê a tabela por user_id, que é a chave da sessão.
DROP POLICY IF EXISTS academia_reservas_do_aluno ON public.academia_reservas;
CREATE POLICY academia_reservas_do_aluno ON public.academia_reservas
  FOR SELECT TO authenticated
  USING (profile_id IS NOT NULL AND profile_id = public.meu_profile_id());

COMMENT ON TABLE public.academia_reservas IS
  'Reserva de vaga numa aula. No regime "reserva" e ela que da previsibilidade ao dono e vira falta quando ninguem aparece.';

-- ---------------------------------------------------------------------------
-- 5. A grade de aulas com vagas.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.academia_aulas_disponiveis(uuid, date, date);

CREATE FUNCTION public.academia_aulas_disponiveis(
  p_partner_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL
)
RETURNS TABLE(
  turma_id uuid,
  turma text,
  modalidade text,
  data date,
  dia_semana smallint,
  inicio timestamptz,
  fim timestamptz,
  hora_inicio time,
  hora_fim time,
  capacidade smallint,
  reservados integer,
  vagas integer,
  fechada boolean,
  motivo text,
  eu_reservei boolean,
  minha_reserva_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tz    text;
  v_hoje  date;
  v_de    date;
  v_ate   date;
  v_perfil uuid := public.meu_profile_id();
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz   := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_de   := GREATEST(COALESCE(p_de, v_hoje), v_hoje);   -- ninguem reserva o passado
  v_ate  := COALESCE(p_ate, v_hoje + 13);               -- duas semanas a frente

  RETURN QUERY
  WITH dia AS (
    SELECT g.d::date AS data, EXTRACT(DOW FROM g.d)::smallint AS dow
      FROM generate_series(v_de::timestamp, v_ate::timestamp, interval '1 day') g(d)
  ),
  aula AS (
    SELECT t.id, t.nome, t.modalidade, t.capacidade, t.hora_inicio, t.hora_fim,
           d.data, d.dow,
           ((d.data::text || ' ' || t.hora_inicio::text)::timestamp AT TIME ZONE v_tz) AS ini,
           ((d.data::text || ' ' || COALESCE(t.hora_fim, t.hora_inicio)::text)::timestamp AT TIME ZONE v_tz) AS fim,
           EXISTS (SELECT 1 FROM public.partner_feriados fe
                    WHERE fe.partner_id = p_partner_id AND fe.data = d.data AND fe.fechado) AS feriado
      FROM public.academia_turmas t
      JOIN dia d ON (cardinality(t.dias_semana) = 0 OR d.dow = ANY(t.dias_semana))
     WHERE t.partner_id = p_partner_id AND t.ativo AND t.hora_inicio IS NOT NULL
  )
  SELECT a.id, a.nome, a.modalidade, a.data, a.dow, a.ini, a.fim,
         a.hora_inicio, a.hora_fim, a.capacidade,
         COALESCE(r.ocupadas, 0)::integer,
         -- Sem capacidade definida a aula e ilimitada; -1 diz "nao ha teto"
         -- em vez de fingir um numero que a tela mostraria errado.
         CASE WHEN a.capacidade IS NULL THEN -1
              ELSE GREATEST(a.capacidade - COALESCE(r.ocupadas, 0), 0)::integer END,
         (a.feriado OR a.fim <= now()
          OR (a.capacidade IS NOT NULL AND COALESCE(r.ocupadas, 0) >= a.capacidade)),
         CASE WHEN a.feriado                       THEN 'academia fechada'
              WHEN a.fim <= now()                  THEN 'ja passou'
              WHEN a.capacidade IS NOT NULL
               AND COALESCE(r.ocupadas, 0) >= a.capacidade THEN 'sem vagas'
              ELSE NULL END,
         (m.id IS NOT NULL),
         m.id
    FROM aula a
    LEFT JOIN LATERAL (
      SELECT count(*) AS ocupadas FROM public.academia_reservas rr
       WHERE rr.turma_id = a.id AND rr.data = a.data
         AND rr.status IN ('reservada', 'presente')
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT rr.id FROM public.academia_reservas rr
       WHERE rr.turma_id = a.id AND rr.data = a.data
         AND rr.profile_id IS NOT DISTINCT FROM v_perfil AND v_perfil IS NOT NULL
         AND rr.status IN ('reservada', 'presente')
       LIMIT 1
    ) m ON true
   ORDER BY a.data, a.hora_inicio, a.nome;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_aulas_disponiveis(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_aulas_disponiveis(uuid, date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Reservar.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.academia_reservar_aula(uuid, uuid, date);

CREATE FUNCTION public.academia_reservar_aula(
  p_partner_id uuid,
  p_turma_id uuid,
  p_data date
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tz      text;
  v_hoje    date;
  v_perfil  uuid := public.meu_profile_id();
  v_student uuid;
  v_cred    uuid;
  v_turma   public.academia_turmas%ROWTYPE;
  v_ini     timestamptz;
  v_fim     timestamptz;
  v_dow     smallint;
  v_ocupadas integer;
  v_existe  uuid;
  v_novo    uuid;
  v_motivo  text;
BEGIN
  IF v_perfil IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para reservar.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz   := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  SELECT * INTO v_turma FROM public.academia_turmas
   WHERE id = p_turma_id AND partner_id = p_partner_id AND ativo;
  IF NOT FOUND OR v_turma.hora_inicio IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Esta aula não existe mais.');
  END IF;

  v_dow := EXTRACT(DOW FROM p_data)::smallint;
  IF cardinality(v_turma.dias_semana) > 0 AND NOT (v_dow = ANY(v_turma.dias_semana)) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Esta aula não acontece neste dia da semana.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.partner_feriados fe
              WHERE fe.partner_id = p_partner_id AND fe.data = p_data AND fe.fechado) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'A academia está fechada neste dia.');
  END IF;

  v_ini := ((p_data::text || ' ' || v_turma.hora_inicio::text)::timestamp AT TIME ZONE v_tz);
  v_fim := ((p_data::text || ' ' || COALESCE(v_turma.hora_fim, v_turma.hora_inicio)::text)::timestamp AT TIME ZONE v_tz);
  IF v_fim <= now() THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Esta aula já passou.');
  END IF;

  SELECT s.id INTO v_student FROM public.students s WHERE s.profile_id = v_perfil LIMIT 1;

  SELECT cr.id INTO v_cred FROM public.academia_credenciais cr
   WHERE cr.partner_id = p_partner_id AND cr.ativo
     AND cr.student_id IS NOT NULL AND cr.student_id = v_student
   LIMIT 1;

  IF v_student IS NULL AND v_cred IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Você ainda não está cadastrado nesta academia.');
  END IF;

  -- A mensalidade decide. A régua é a MESMA que libera a entrada: se a reserva
  -- usasse outro critério, a pessoa reservaria hoje e levaria "bloqueado" na
  -- cara amanhã, na frente da recepção.
  SELECT a.motivo INTO v_motivo
    FROM public.acesso_avaliar_academia(p_partner_id) a
   WHERE (v_cred IS NOT NULL AND a.credencial_id = v_cred)
      OR (v_cred IS NULL AND a.student_id = v_student)
   LIMIT 1;

  IF v_motivo = 'vencido_bloqueado' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Sua mensalidade está vencida. Regularize para reservar.');
  END IF;
  IF v_motivo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Você não tem mensalidade ativa nesta academia.');
  END IF;

  -- Já reservou: devolve a mesma, não cria outra. Botão clicado duas vezes é
  -- a coisa mais comum que existe.
  SELECT id INTO v_existe FROM public.academia_reservas
   WHERE turma_id = p_turma_id AND data = p_data
     AND COALESCE(credencial_id, student_id) = COALESCE(v_cred, v_student)
     AND status IN ('reservada', 'presente')
   LIMIT 1;
  IF v_existe IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'reserva_id', v_existe, 'ja_tinha', true);
  END IF;

  -- Trava antes de contar, senão duas pessoas pegam a última vaga ao mesmo
  -- tempo. Mesmo padrão de `reserve_partner_freebie`.
  PERFORM 1 FROM public.academia_reservas
   WHERE turma_id = p_turma_id AND data = p_data FOR UPDATE;

  IF v_turma.capacidade IS NOT NULL THEN
    SELECT count(*) INTO v_ocupadas FROM public.academia_reservas
     WHERE turma_id = p_turma_id AND data = p_data AND status IN ('reservada', 'presente');
    IF v_ocupadas >= v_turma.capacidade THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'Esta aula lotou.');
    END IF;
  END IF;

  INSERT INTO public.academia_reservas
    (partner_id, turma_id, credencial_id, student_id, profile_id,
     data, inicio, fim, dia_semana, origem)
  VALUES
    (p_partner_id, p_turma_id, v_cred, v_student, v_perfil,
     p_data, v_ini, v_fim, v_dow, 'aluno')
  RETURNING id INTO v_novo;

  RETURN jsonb_build_object('ok', true, 'reserva_id', v_novo, 'ja_tinha', false,
                            'turma', v_turma.nome, 'inicio', v_ini);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_reservar_aula(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_reservar_aula(uuid, uuid, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Cancelar.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.academia_cancelar_reserva(uuid);

CREATE FUNCTION public.academia_cancelar_reserva(p_reserva_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r public.academia_reservas%ROWTYPE;
  v_perfil uuid := public.meu_profile_id();
BEGIN
  SELECT * INTO r FROM public.academia_reservas WHERE id = p_reserva_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Reserva não encontrada.');
  END IF;

  -- Ou é do próprio aluno, ou é alguém da academia cancelando pela recepção.
  IF NOT (r.profile_id IS NOT NULL AND r.profile_id = v_perfil)
     AND NOT public.academia_pode_ver(r.partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta reserva.' USING ERRCODE = '42501';
  END IF;

  IF r.status = 'presente' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Esta pessoa já entrou na aula.');
  END IF;
  IF r.status = 'cancelada' THEN
    RETURN jsonb_build_object('ok', true, 'ja_estava', true);
  END IF;

  UPDATE public.academia_reservas
     SET status = 'cancelada', cancelada_em = now()
   WHERE id = p_reserva_id;

  RETURN jsonb_build_object('ok', true, 'ja_estava', false);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_cancelar_reserva(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_cancelar_reserva(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. O QR do aluno, e o que ele mostra.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.academia_meu_qr(uuid);

CREATE FUNCTION public.academia_meu_qr(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_perfil  uuid := public.meu_profile_id();
  v_student uuid;
  v_cred    public.academia_credenciais%ROWTYPE;
  v_aval    record;
BEGIN
  IF v_perfil IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta.' USING ERRCODE = '42501';
  END IF;

  SELECT s.id INTO v_student FROM public.students s WHERE s.profile_id = v_perfil LIMIT 1;

  SELECT * INTO v_cred FROM public.academia_credenciais cr
   WHERE cr.partner_id = p_partner_id AND cr.ativo
     AND cr.student_id IS NOT NULL AND cr.student_id = v_student
   LIMIT 1;

  IF v_cred.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Você ainda não está cadastrado nesta academia.');
  END IF;

  IF v_cred.qr_token IS NULL THEN
    UPDATE public.academia_credenciais
       SET qr_token = replace(gen_random_uuid()::text, '-', '')
     WHERE id = v_cred.id
    RETURNING qr_token INTO v_cred.qr_token;
  END IF;

  SELECT a.motivo, a.valido_ate, a.dias_restantes INTO v_aval
    FROM public.acesso_avaliar_academia(p_partner_id) a
   WHERE a.credencial_id = v_cred.id LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'token', v_cred.qr_token,
    'nome', v_cred.nome_no_equipamento,
    'motivo', COALESCE(v_aval.motivo, 'sem_mensalidade'),
    'valido_ate', v_aval.valido_ate,
    'dias_restantes', v_aval.dias_restantes,
    -- A tela do aluno mostra isto ANTES dele sair de casa. Descobrir que está
    -- bloqueado na recepcao, na frente da fila, e o que se quer evitar.
    'liberado', COALESCE(v_aval.motivo, '') IN ('contrato_ativo', 'vencimento_proximo', 'em_carencia')
  );
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_meu_qr(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_meu_qr(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. A leitura do QR na recepção. É aqui que a pessoa entra.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.academia_qr_validar(uuid, text);

CREATE FUNCTION public.academia_qr_validar(p_partner_id uuid, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tz      text;
  v_tol     integer;
  v_hoje    date;
  v_cred    public.academia_credenciais%ROWTYPE;
  v_aval    record;
  v_liberado boolean;
  v_recente uuid;
  v_freq    uuid;
  v_turma   uuid;
  v_reserva public.academia_reservas%ROWTYPE;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'), COALESCE(c.tolerancia_aula_min, 30)
    INTO v_tz, v_tol
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz  := COALESCE(v_tz, 'America/Sao_Paulo');
  v_tol := COALESCE(v_tol, 30);
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  SELECT * INTO v_cred FROM public.academia_credenciais
   WHERE partner_id = p_partner_id AND qr_token = p_token AND ativo;

  IF v_cred.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'liberado', false,
                              'erro', 'Código não reconhecido nesta academia.');
  END IF;

  SELECT a.motivo, a.valido_ate, a.dias_restantes INTO v_aval
    FROM public.acesso_avaliar_academia(p_partner_id) a
   WHERE a.credencial_id = v_cred.id LIMIT 1;

  v_liberado := COALESCE(v_aval.motivo, '') IN ('contrato_ativo', 'vencimento_proximo', 'em_carencia');

  IF NOT v_liberado THEN
    INSERT INTO public.academia_acessos_negados
      (partner_id, student_id, referencia, motivo, origem, detalhe)
    VALUES (p_partner_id, v_cred.student_id, v_cred.referencia,
            COALESCE(v_aval.motivo, 'sem_mensalidade'), 'qrcode',
            'Leitura de QR na recepcao');

    RETURN jsonb_build_object(
      'ok', true, 'liberado', false,
      'nome', v_cred.nome_no_equipamento,
      'motivo', COALESCE(v_aval.motivo, 'sem_mensalidade'),
      'valido_ate', v_aval.valido_ate,
      'dias_restantes', v_aval.dias_restantes);
  END IF;

  -- Ler o mesmo código duas vezes em seguida é a recepcao conferindo, nao a
  -- pessoa treinando duas vezes. Sem esta janela, o relatorio de frequencia
  -- conta cada conferida como um treino.
  SELECT f.id INTO v_recente FROM public.academia_frequencias f
   WHERE f.partner_id = p_partner_id AND f.credencial_id = v_cred.id
     AND f.entrada_em > now() - interval '5 minutes'
   ORDER BY f.entrada_em DESC LIMIT 1;

  IF v_recente IS NULL THEN
    INSERT INTO public.academia_frequencias
      (partner_id, credencial_id, student_id, origem, entrada_em)
    VALUES (p_partner_id, v_cred.id, v_cred.student_id, 'qrcode', now())
    RETURNING id INTO v_freq;
  ELSE
    v_freq := v_recente;
  END IF;

  -- Se ela reservou a aula que está começando, a presença é marcada sozinha.
  v_turma := public.academia_turma_no_horario(p_partner_id, (now() AT TIME ZONE v_tz), v_tol);

  IF v_turma IS NOT NULL THEN
    SELECT * INTO v_reserva FROM public.academia_reservas
     WHERE partner_id = p_partner_id AND turma_id = v_turma AND data = v_hoje
       AND COALESCE(credencial_id, student_id)
           = COALESCE(v_cred.id, v_cred.student_id)
       AND status = 'reservada'
     LIMIT 1;

    IF v_reserva.id IS NOT NULL THEN
      UPDATE public.academia_reservas
         SET status = 'presente', presente_em = now(), frequencia_id = v_freq
       WHERE id = v_reserva.id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'liberado', true,
    'nome', v_cred.nome_no_equipamento,
    'motivo', v_aval.motivo,
    'valido_ate', v_aval.valido_ate,
    'dias_restantes', v_aval.dias_restantes,
    'repetido', v_recente IS NOT NULL,
    'turma_id', v_turma,
    'reserva_marcada', v_reserva.id IS NOT NULL);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_qr_validar(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_qr_validar(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. O dia do dono: quem reservou, quem veio, quem faltou.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.academia_reservas_do_dia(uuid, date);

CREATE FUNCTION public.academia_reservas_do_dia(p_partner_id uuid, p_data date DEFAULT NULL)
RETURNS TABLE(
  turma_id uuid,
  turma text,
  hora_inicio time,
  hora_fim time,
  capacidade smallint,
  reservados integer,
  presentes integer,
  faltas integer,
  pessoas jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tz text;
  v_dia date;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz  := COALESCE(v_tz, 'America/Sao_Paulo');
  v_dia := COALESCE(p_data, (now() AT TIME ZONE v_tz)::date);

  RETURN QUERY
  SELECT t.id, t.nome, t.hora_inicio, t.hora_fim, t.capacidade,
         count(*) FILTER (WHERE r.status IN ('reservada','presente'))::integer,
         count(*) FILTER (WHERE r.status = 'presente')::integer,
         count(*) FILTER (WHERE r.status = 'faltou')::integer,
         COALESCE(jsonb_agg(
           jsonb_build_object(
             'reserva_id', r.id,
             'nome', COALESCE(pr.name, cr.nome_no_equipamento, 'Sem nome'),
             'telefone', COALESCE(pr.phone, cr.telefone),
             'status', r.status,
             'presente_em', r.presente_em
           ) ORDER BY r.status, COALESCE(pr.name, cr.nome_no_equipamento)
         ) FILTER (WHERE r.id IS NOT NULL AND r.status <> 'cancelada'), '[]'::jsonb)
    FROM public.academia_turmas t
    LEFT JOIN public.academia_reservas r
      ON r.turma_id = t.id AND r.data = v_dia AND r.status <> 'cancelada'
    LEFT JOIN public.academia_credenciais cr ON cr.id = r.credencial_id
    LEFT JOIN public.students st ON st.id = r.student_id
    LEFT JOIN public.profiles pr ON pr.id = st.profile_id
   WHERE t.partner_id = p_partner_id AND t.ativo AND t.hora_inicio IS NOT NULL
     AND (cardinality(t.dias_semana) = 0
          OR EXTRACT(DOW FROM v_dia)::smallint = ANY(t.dias_semana))
   GROUP BY t.id, t.nome, t.hora_inicio, t.hora_fim, t.capacidade
   ORDER BY t.hora_inicio;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_reservas_do_dia(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_reservas_do_dia(uuid, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Quem reservou e não veio vira falta — depois que a aula acabou.
-- ---------------------------------------------------------------------------
--
-- Roda sob demanda, não por gatilho: gatilho de tempo não existe em Postgres
-- sem agendador, e marcar falta no meio da aula acusaria quem chegou atrasado.
DROP FUNCTION IF EXISTS public.academia_fechar_faltas(uuid, date);

CREATE FUNCTION public.academia_fechar_faltas(p_partner_id uuid, p_ate date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_tz text;
  v_n integer;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;

  UPDATE public.academia_reservas r
     SET status = 'faltou'
   WHERE r.partner_id = p_partner_id
     AND r.status = 'reservada'
     AND r.fim < now()
     AND (p_ate IS NULL OR r.data <= p_ate);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'faltas_marcadas', v_n);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_fechar_faltas(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_fechar_faltas(uuid, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 12. De quais academias eu sou aluno.
-- ---------------------------------------------------------------------------
--
-- A tela do aluno precisa disto antes de qualquer outra coisa: sem saber a
-- academia, ela não tem o que pedir. Sai de `academia_credenciais`, que é onde
-- mora o vínculo de verdade — quem tem credencial ativa treina lá.
DROP FUNCTION IF EXISTS public.academia_minhas_academias();

CREATE FUNCTION public.academia_minhas_academias()
RETURNS TABLE(
  partner_id uuid,
  nome text,
  cidade text,
  estado text,
  foto text,
  regime_turma text,
  tem_reserva boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_perfil uuid := public.meu_profile_id();
BEGIN
  IF v_perfil IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT DISTINCT ON (pt.id)
         pt.id, pt.fantasy_name::text, pt.city::text, pt.state::text, pt.photo_url::text,
         COALESCE(c.regime_turma, 'livre')::text,
         -- Reservar so faz sentido onde a academia trabalha por reserva. Numa
         -- academia de treino livre, oferecer o botao seria prometer um
         -- controle que ela nao tem.
         COALESCE(c.regime_turma, 'livre') = 'reserva'
    FROM public.academia_credenciais cr
    JOIN public.students s   ON s.id = cr.student_id
    JOIN public.partners pt  ON pt.id = cr.partner_id
    LEFT JOIN public.partner_acesso_config c ON c.partner_id = pt.id
   WHERE cr.ativo AND s.profile_id = v_perfil
   ORDER BY pt.id, pt.fantasy_name;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_minhas_academias() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_minhas_academias() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 13. As minhas reservas.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.academia_minhas_reservas(uuid);

CREATE FUNCTION public.academia_minhas_reservas(p_partner_id uuid DEFAULT NULL)
RETURNS TABLE(
  reserva_id uuid,
  partner_id uuid,
  academia text,
  turma text,
  data date,
  inicio timestamptz,
  fim timestamptz,
  status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_perfil uuid := public.meu_profile_id();
BEGIN
  IF v_perfil IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT r.id, r.partner_id, pt.fantasy_name::text, t.nome::text,
         r.data, r.inicio, r.fim, r.status
    FROM public.academia_reservas r
    JOIN public.academia_turmas t ON t.id = r.turma_id
    JOIN public.partners pt ON pt.id = r.partner_id
   WHERE r.profile_id = v_perfil
     AND (p_partner_id IS NULL OR r.partner_id = p_partner_id)
     AND r.status <> 'cancelada'
     -- O que ja passou vira historico e sai da tela: a lista e "o que eu tenho
     -- pela frente", nao um diario.
     AND r.fim > now() - interval '12 hours'
   ORDER BY r.inicio;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_minhas_reservas(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_minhas_reservas(uuid) TO authenticated, service_role;
