-- ==========================================================================
-- PROPOSTA — NAO APLICADA. Escrita pelo chat de funcionalidades.
-- Fora de supabase/migrations/ de proposito. Quem aplica: chat financeiro.
--
-- OBJETIVO: desafio de corrida com PREMIO. O aluno corre no Nike Run (ou
-- Strava, Garmin, Samsung Health), o app nativo le do Health Connect /
-- HealthKit e envia para ca. Regras possiveis: total de km no mes, quem
-- bate X km primeiro, melhor pace.
-- ==========================================================================
--
-- O QUE JA EXISTE E NAO DEVE SER TOCADO
--
--   challenge_editions / challenge_winners / challenge_final_weighin
--       -> o Desafio FitMind de pesagem. Outro dominio.
--   personal_challenges
--       -> desafio de habito por dias. Outro dominio.
--   workout_cardio_logs
--       -> cardio PRESCRITO pelo coach, preso a workout_sessions.plan_id.
--          Corrida externa nao tem sessao nem plano; nao cabe la.
--   monthly_rankings
--       -> ranking de VENDA de coach (total_revenue, is_top_seller).
--          Nao encostar.
--
-- Por isso as tabelas abaixo sao novas.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- PARTE 1 — atividades externas lidas das plataformas de saude
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.external_activities (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id        uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  -- Idempotencia: o app nativo reenvia o mesmo lote quando o usuario abre
  -- o app de novo. Sem esta unique, cada abertura duplicaria a pontuacao.
  source_app_id     text NOT NULL,
  external_id       text NOT NULL,

  activity_type     text NOT NULL,
  started_at        timestamptz NOT NULL,
  ended_at          timestamptz NOT NULL,
  distance_km       numeric(8,3) NOT NULL,
  duration_min      numeric(8,2) NOT NULL,
  calories          numeric(8,2),
  elevation_m       numeric(8,2),
  avg_hr            numeric(5,1),

  -- Proveniencia. `recording_method` vem do Health Connect / HealthKit e e
  -- melhor esforco da plataforma, NAO garantia — serve para pontuar risco.
  source_app_name   text,
  source_device     text,
  recording_method  text CHECK (recording_method IN ('gravado_ao_vivo','manual','desconhecido')),
  platform          text NOT NULL CHECK (platform IN ('health_connect','healthkit')),
  app_version       text,

  -- Veredito calculado no SERVIDOR (src/lib/corridas-validacao.ts).
  -- 'marcada' conta, mas fica sinalizada para conferencia antes do premio.
  verdict           text NOT NULL CHECK (verdict IN ('aceita','marcada','rejeitada')),
  reasons           jsonb NOT NULL DEFAULT '[]'::jsonb,
  counted_km        numeric(8,3) NOT NULL DEFAULT 0,

  -- CARIMBO DO SERVIDOR. E ISTO que ordena o "quem bate X km primeiro".
  -- Registro de saude aceita data retroativa: alguem sincroniza hoje uma
  -- corrida datada de anteontem e reivindica posicao que ja era de outro.
  -- Se o ranking ordenasse por started_at, ganharia quem sincronizasse por
  -- ultimo com a data mais antiga.
  received_at       timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (student_id, source_app_id, external_id)
);

CREATE INDEX IF NOT EXISTS ext_act_student_periodo_idx
  ON public.external_activities (student_id, started_at DESC);
CREATE INDEX IF NOT EXISTS ext_act_recebido_idx
  ON public.external_activities (received_at);
CREATE INDEX IF NOT EXISTS ext_act_veredito_idx
  ON public.external_activities (verdict) WHERE verdict = 'marcada';

ALTER TABLE public.external_activities ENABLE ROW LEVEL SECURITY;


-- --------------------------------------------------------------------------
-- PARTE 2 — A REGRA MAIS IMPORTANTE DESTE ARQUIVO
-- --------------------------------------------------------------------------
-- O ALUNO NAO PODE INSERIR NEM ATUALIZAR external_activities.
--
-- Toda a validacao antifraude (velocidade impossivel, entrada manual,
-- duplicata entre fontes, teto diario) roda numa server function. Se a
-- tabela aceitar INSERT do cliente, basta um POST no PostgREST com
-- distance_km = 500 e verdict = 'aceita' para ganhar o premio. A validacao
-- inteira vira decoracao.
--
-- Escrita SOMENTE via service role, de dentro da server function.

CREATE POLICY ext_act_aluno_le_o_proprio ON public.external_activities
  FOR SELECT TO authenticated
  USING (student_id IN (
    SELECT s.id FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid()
  ));

-- Coach ve as atividades dos alunos dele (acompanhamento e conferencia).
-- CONFIRMAR o nome da coluna de vinculo aluno->coach antes de aplicar;
-- eu nao auditei o schema de students por inteiro.
CREATE POLICY ext_act_coach_le_alunos ON public.external_activities
  FOR SELECT TO authenticated
  USING (student_id IN (
    SELECT s.id FROM public.students s
    JOIN public.coaches c ON c.id = s.coach_id
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY ext_act_admin ON public.external_activities
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

-- Nenhuma policy de INSERT/UPDATE para authenticated. Intencional.
REVOKE INSERT, UPDATE, DELETE ON public.external_activities FROM authenticated, anon;


-- --------------------------------------------------------------------------
-- PARTE 3 — o desafio em si
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.running_challenges (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text NOT NULL,
  description       text,
  starts_at         timestamptz NOT NULL,
  ends_at           timestamptz NOT NULL,

  -- total_km    : soma no periodo, maior ganha
  -- first_to_km : quem cruza target_km primeiro (ordena por received_at)
  -- best_pace   : melhor pace numa atividade acima da distancia minima
  rule_type         text NOT NULL CHECK (rule_type IN ('total_km','first_to_km','best_pace')),
  target_km         numeric(8,2),
  min_distance_km   numeric(8,2) DEFAULT 3,

  prize_description text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at),
  CHECK (rule_type <> 'first_to_km' OR target_km IS NOT NULL)
);

ALTER TABLE public.running_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY rc_todos_leem ON public.running_challenges
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY rc_admin ON public.running_challenges
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));


-- --------------------------------------------------------------------------
-- PARTE 4 — marco de meta atingida (so para first_to_km)
-- --------------------------------------------------------------------------
-- Uma linha por aluno, gravada no instante em que o acumulado cruza a meta.
-- `reached_at` e carimbo do servidor e e o criterio de desempate.

CREATE TABLE IF NOT EXISTS public.running_challenge_milestones (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id  uuid NOT NULL REFERENCES public.running_challenges(id) ON DELETE CASCADE,
  student_id    uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reached_at    timestamptz NOT NULL DEFAULT now(),
  km_at_moment  numeric(8,3) NOT NULL,
  -- true se qualquer atividade que compos o total ficou 'marcada'
  has_pending   boolean NOT NULL DEFAULT false,
  -- conferencia humana antes de pagar o premio
  reviewed_at   timestamptz,
  reviewed_by   uuid REFERENCES public.profiles(id),
  review_note   text,
  UNIQUE (challenge_id, student_id)
);

ALTER TABLE public.running_challenge_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY rcm_leitura ON public.running_challenge_milestones
  FOR SELECT TO authenticated USING (true);

CREATE POLICY rcm_admin ON public.running_challenge_milestones
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.running_challenge_milestones FROM authenticated, anon;


-- --------------------------------------------------------------------------
-- PARTE 5 — ranking, sem expor dado pessoal
-- --------------------------------------------------------------------------
-- SECURITY DEFINER para somar atividades que o chamador nao pode ler.
-- Devolve apenas nome e avatar: nada de email, telefone ou cpf.

CREATE OR REPLACE FUNCTION public.ranking_corrida(_challenge_id uuid)
RETURNS TABLE (
  student_id   uuid,
  nome         text,
  avatar_url   text,
  total_km     numeric,
  melhor_pace  numeric,
  atingido_em  timestamptz,
  tem_pendencia boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH d AS (SELECT * FROM public.running_challenges WHERE id = _challenge_id),
  somas AS (
    SELECT a.student_id,
           SUM(a.counted_km)                                      AS total_km,
           MIN(CASE WHEN a.distance_km >= (SELECT min_distance_km FROM d)
                    THEN a.duration_min / NULLIF(a.distance_km,0) END) AS melhor_pace,
           BOOL_OR(a.verdict = 'marcada')                         AS tem_pendencia
      FROM public.external_activities a, d
     WHERE a.verdict <> 'rejeitada'
       AND a.started_at >= d.starts_at
       AND a.ended_at   <= d.ends_at
     GROUP BY a.student_id
  )
  SELECT s.student_id, p.name, p.avatar_url,
         s.total_km, s.melhor_pace,
         m.reached_at,
         s.tem_pendencia OR COALESCE(m.has_pending, false)
    FROM somas s
    JOIN public.students st ON st.id = s.student_id
    JOIN public.profiles p  ON p.id = st.profile_id
    LEFT JOIN public.running_challenge_milestones m
           ON m.student_id = s.student_id AND m.challenge_id = _challenge_id
   ORDER BY m.reached_at ASC NULLS LAST, s.total_km DESC;
$$;

REVOKE ALL ON FUNCTION public.ranking_corrida(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ranking_corrida(uuid) TO authenticated;


-- --------------------------------------------------------------------------
-- VERIFICACAO — rodar depois de aplicar
-- --------------------------------------------------------------------------
-- 1) O aluno NAO consegue inserir atividade (o teste mais importante):
--    logado como aluno, POST /rest/v1/external_activities
--    -> tem que dar 401 ou 403. Se gravar, a validacao inteira e inutil.
--
-- 2) Nenhuma policy nova sem clausula TO:
--    SELECT tablename, policyname, roles FROM pg_policies
--     WHERE schemaname='public' AND 'public' = ANY(roles);
--
-- 3) Idempotencia: inserir o mesmo (student_id, source_app_id, external_id)
--    duas vezes tem que violar a unique.
--
-- 4) ranking_corrida nao pode devolver email/telefone/cpf.
-- ==========================================================================
