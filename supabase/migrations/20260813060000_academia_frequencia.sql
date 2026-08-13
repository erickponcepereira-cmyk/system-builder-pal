-- Frequencia, turmas e contador premiavel.
--
-- Duas origens de validacao convivem: catraca e QR da academia. A academia
-- escolhe qual usa, e as duas gravam na mesma tabela, separadas por origem.
--
-- Todas as perguntas de contagem sao decisao da academia, por seletor:
--   conta DIA ou conta ENTRADA?  o contador e VITALICIO ou zera por periodo?

-- 1. Configuracao ------------------------------------------------------------

ALTER TABLE public.partner_acesso_config
  ADD COLUMN IF NOT EXISTS validacao_frequencia text NOT NULL DEFAULT 'catraca',
  ADD COLUMN IF NOT EXISTS frequencia_conta     text NOT NULL DEFAULT 'dia',
  ADD COLUMN IF NOT EXISTS frequencia_periodo   text NOT NULL DEFAULT 'vitalicio',
  ADD COLUMN IF NOT EXISTS frequencia_meta      integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_acesso_config_validacao_check') THEN
    ALTER TABLE public.partner_acesso_config
      ADD CONSTRAINT partner_acesso_config_validacao_check
      CHECK (validacao_frequencia IN ('catraca', 'qrcode', 'ambos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_acesso_config_conta_check') THEN
    ALTER TABLE public.partner_acesso_config
      ADD CONSTRAINT partner_acesso_config_conta_check
      CHECK (frequencia_conta IN ('dia', 'entrada'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'partner_acesso_config_periodo_check') THEN
    ALTER TABLE public.partner_acesso_config
      ADD CONSTRAINT partner_acesso_config_periodo_check
      CHECK (frequencia_periodo IN ('vitalicio', 'anual', 'mensal'));
  END IF;
END $$;

COMMENT ON COLUMN public.partner_acesso_config.frequencia_meta IS
  'Meta de aulas para premiacao, ex.: 100. Nulo = sem meta.';

-- 2. Turmas ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.academia_turmas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  nome text NOT NULL,
  modalidade text,
  dia_semana smallint CHECK (dia_semana IS NULL OR dia_semana BETWEEN 0 AND 6),
  hora_inicio time,
  hora_fim time,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academia_turmas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_turmas_acesso ON public.academia_turmas;
CREATE POLICY academia_turmas_acesso ON public.academia_turmas
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- 3. Registro de frequencia --------------------------------------------------
-- Toda entrada e registrada, inclusive a segunda do mesmo dia. Quem decide se
-- ela CONTA e a configuracao; o registro nunca mente sobre o que aconteceu.

CREATE TABLE IF NOT EXISTS public.academia_frequencias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  turma_id uuid REFERENCES public.academia_turmas(id) ON DELETE SET NULL,
  origem text NOT NULL DEFAULT 'catraca' CHECK (origem IN ('catraca', 'qrcode', 'manual')),
  entrada_em timestamptz NOT NULL DEFAULT now(),
  saida_em timestamptz,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academia_frequencias_idx
  ON public.academia_frequencias (partner_id, student_id, entrada_em DESC);

ALTER TABLE public.academia_frequencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_frequencias_acesso ON public.academia_frequencias;
CREATE POLICY academia_frequencias_acesso ON public.academia_frequencias
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- 4. Fonte unica da frequencia -----------------------------------------------
--
-- NAO unir com partner_visits. Apesar do nome parecido, aquela tabela e visita
-- do aluno a uma EMPRESA parceira (check-in por QR no comercio conveniado, que
-- grava em attendance_logs como 'partner_visit'). Somar aquilo aqui faria um
-- aluno que passou num restaurante parceiro contar como aula feita — e este
-- contador e justamente o que premia por aula concluida.
--
-- Catraca e QR da academia gravam os dois em academia_frequencias, separados
-- pela coluna origem.

CREATE OR REPLACE VIEW public.academia_frequencia_unificada AS
  SELECT f.partner_id, f.student_id, f.turma_id, f.origem, f.entrada_em, f.saida_em
    FROM public.academia_frequencias f;

-- 5. Contador, respeitando a configuracao da academia ------------------------

CREATE OR REPLACE FUNCTION public.academia_frequencia_contador(
  p_partner_id uuid,
  p_student_id uuid
)
RETURNS TABLE (
  total integer,
  no_periodo integer,
  ultima timestamptz,
  conta text,
  periodo text,
  meta integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conta   text;
  v_periodo text;
  v_meta    integer;
  v_tz      text;
  v_hoje    date;
  v_desde   date;
BEGIN
  SELECT COALESCE(c.frequencia_conta, 'dia'), COALESCE(c.frequencia_periodo, 'vitalicio'),
         c.frequencia_meta, COALESCE(c.timezone, 'America/Sao_Paulo')
    INTO v_conta, v_periodo, v_meta, v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;

  v_conta   := COALESCE(v_conta, 'dia');
  v_periodo := COALESCE(v_periodo, 'vitalicio');
  v_tz      := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje    := (now() AT TIME ZONE v_tz)::date;

  v_desde := CASE v_periodo
               WHEN 'mensal' THEN date_trunc('month', v_hoje)::date
               WHEN 'anual'  THEN date_trunc('year',  v_hoje)::date
               ELSE NULL
             END;

  RETURN QUERY
  WITH base AS (
    SELECT u.entrada_em, (u.entrada_em AT TIME ZONE v_tz)::date AS dia
      FROM public.academia_frequencia_unificada u
     WHERE u.partner_id = p_partner_id AND u.student_id = p_student_id
  )
  SELECT
    -- conta 'dia' agrupa entradas do mesmo dia; 'entrada' conta cada passagem
    CASE WHEN v_conta = 'dia' THEN (SELECT count(DISTINCT b.dia)::integer FROM base b)
         ELSE (SELECT count(*)::integer FROM base b) END,
    CASE WHEN v_desde IS NULL THEN
           CASE WHEN v_conta = 'dia' THEN (SELECT count(DISTINCT b.dia)::integer FROM base b)
                ELSE (SELECT count(*)::integer FROM base b) END
         WHEN v_conta = 'dia' THEN (SELECT count(DISTINCT b.dia)::integer FROM base b WHERE b.dia >= v_desde)
         ELSE (SELECT count(*)::integer FROM base b WHERE b.dia >= v_desde) END,
    (SELECT max(b.entrada_em) FROM base b),
    v_conta, v_periodo, v_meta;
END;
$$;

-- 6. Relatorio da academia ---------------------------------------------------
-- Uma linha por aluno: quantas vezes veio, quanto tempo em media ficou, quando
-- foi a ultima vez, e se entrou mais de uma vez hoje.

CREATE OR REPLACE FUNCTION public.academia_frequencia_relatorio(
  p_partner_id uuid,
  p_desde date DEFAULT NULL,
  p_turma_id uuid DEFAULT NULL
)
RETURNS TABLE (
  student_id uuid,
  nome text,
  visitas integer,
  dias integer,
  minutos_medios integer,
  ultima timestamptz,
  repetiu_hoje boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz   text;
  v_hoje date;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  RETURN QUERY
  WITH base AS (
    SELECT u.student_id,
           u.entrada_em,
           u.saida_em,
           (u.entrada_em AT TIME ZONE v_tz)::date AS dia
      FROM public.academia_frequencia_unificada u
     WHERE u.partner_id = p_partner_id
       AND (p_desde IS NULL OR (u.entrada_em AT TIME ZONE v_tz)::date >= p_desde)
       AND (p_turma_id IS NULL OR u.turma_id = p_turma_id)
  )
  SELECT b.student_id,
         COALESCE(pr.name, 'Sem nome')::text,
         count(*)::integer,
         count(DISTINCT b.dia)::integer,
         -- so entra na media quem tem saida registrada; sem saida nao se
         -- inventa duracao
         COALESCE(avg(EXTRACT(EPOCH FROM (b.saida_em - b.entrada_em)) / 60)
                    FILTER (WHERE b.saida_em IS NOT NULL), 0)::integer,
         max(b.entrada_em),
         count(*) FILTER (WHERE b.dia = v_hoje) > 1
    FROM base b
    JOIN public.students s  ON s.id = b.student_id
    JOIN public.profiles pr ON pr.id = s.profile_id
   GROUP BY b.student_id, pr.name
   ORDER BY count(*) DESC, pr.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_frequencia_contador(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_frequencia_relatorio(uuid, date, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.academia_frequencia_contador(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_frequencia_relatorio(uuid, date, uuid) TO authenticated, service_role;
