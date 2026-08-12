-- Corrige um buraco do primeiro incremento do controle de acesso de academia.
--
-- Problema: academia_mensalidades nasceu sem coluna de status, e acesso_avaliar
-- usa max(valido_ate) sem filtro. Consequencia: uma mensalidade lancada por
-- engano, cancelada ou estornada continua liberando a catraca, e nao existe
-- forma de anular o lancamento sem apagar a linha (o que destruiria o historico
-- financeiro).
--
-- Correcao: status explicito + a funcao passa a considerar apenas 'ativa'.

-- 1. Estado do lancamento -------------------------------------------------

ALTER TABLE public.academia_mensalidades
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ativa';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'academia_mensalidades_status_check'
       AND conrelid = 'public.academia_mensalidades'::regclass
  ) THEN
    ALTER TABLE public.academia_mensalidades
      ADD CONSTRAINT academia_mensalidades_status_check
      CHECK (status IN ('ativa', 'cancelada', 'estornada'));
  END IF;
END $$;

-- Cancelar nunca apaga a linha: o lancamento continua no historico financeiro,
-- apenas deixa de valer para acesso.
ALTER TABLE public.academia_mensalidades
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS motivo_cancelamento text;

-- 2. Indice do caminho quente ---------------------------------------------
-- acesso_avaliar roda a cada identificacao na porta.

CREATE INDEX IF NOT EXISTS academia_mensalidades_acesso_idx
  ON public.academia_mensalidades (partner_id, student_id, status, valido_ate DESC);

-- 3. A funcao passa a ignorar o que nao esta ativo -------------------------
-- Identica a versao anterior, exceto pelo filtro de status.

CREATE OR REPLACE FUNCTION public.acesso_avaliar(p_partner_id uuid, p_student_id uuid)
RETURNS TABLE (decisao text, motivo text, dias_restantes integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
  v_carencia integer;
  v_valido_ate date;
  v_hoje date;
  v_dias integer;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'), COALESCE(c.dias_carencia, 3)
    INTO v_tz, v_carencia
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;

  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_carencia := COALESCE(v_carencia, 3);
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  SELECT max(m.valido_ate) INTO v_valido_ate
    FROM public.academia_mensalidades m
   WHERE m.partner_id = p_partner_id
     AND m.student_id = p_student_id
     AND m.status = 'ativa';

  IF v_valido_ate IS NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'sem_mensalidade'::text, NULL::integer;
    RETURN;
  END IF;

  v_dias := v_valido_ate - v_hoje;

  IF v_dias >= 4 THEN
    RETURN QUERY SELECT 'liberado'::text, 'contrato_ativo'::text, v_dias;
  ELSIF v_dias >= 0 THEN
    RETURN QUERY SELECT 'liberado'::text, 'vencimento_proximo'::text, v_dias;
  ELSIF v_dias >= -v_carencia THEN
    RETURN QUERY SELECT 'liberado'::text, 'em_carencia'::text, v_dias;
  ELSE
    RETURN QUERY SELECT 'negado'::text, 'vencido_bloqueado'::text, v_dias;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acesso_avaliar(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acesso_avaliar(uuid, uuid) TO authenticated, service_role;
