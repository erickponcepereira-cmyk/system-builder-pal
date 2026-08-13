-- Day-use / aula experimental: caminho separado da mensalidade.
--
-- A chave e o CPF, nao o cadastro de aluno: visitante quase sempre ainda nao e
-- aluno de ninguem. A regra de quantas vezes cada CPF pode usar e de cada
-- academia (partner_acesso_config.regra_dayuse).

-- 1. Registro de uso ---------------------------------------------------------
--
-- LGPD: guardar CPF de quem NAO e cliente, so para negar entrada no futuro, e
-- tratamento de dado pessoal com finalidade propria. Como o uso e apenas
-- comparacao, guardamos o hash e nunca o numero.
--
-- Honestidade sobre a forca disso: CPF tem ~10^11 combinacoes, entao um hash
-- puro e forcavel por quem tiver a tabela. O partner_id entra no hash para que
-- um vazamento nao permita cruzar a mesma pessoa entre academias. E defesa em
-- profundidade, nao anonimizacao.

CREATE OR REPLACE FUNCTION public.academia_cpf_hash(p_partner_id uuid, p_cpf text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
           sha256(convert_to(p_partner_id::text || ':' || regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g'), 'UTF8')),
           'hex'
         );
$$;

CREATE TABLE IF NOT EXISTS public.academia_dayuse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  cpf_hash text NOT NULL,
  -- ultimos digitos para a recepcao conferir com o documento na mao, sem
  -- guardar o CPF inteiro
  cpf_final text,
  nome text NOT NULL,
  telefone text,
  tipo text NOT NULL DEFAULT 'day_use'
    CHECK (tipo IN ('day_use', 'aula_experimental', 'cortesia')),
  valor numeric(12,2) NOT NULL DEFAULT 0,
  forma_pagamento text
    CHECK (forma_pagamento IS NULL OR forma_pagamento IN
      ('dinheiro','pix','cartao_credito','cartao_debito','transferencia','outro')),
  taxa_percentual numeric(6,4) NOT NULL DEFAULT 0,
  taxa_valor numeric(12,2) NOT NULL DEFAULT 0,
  valor_liquido numeric(12,2) NOT NULL DEFAULT 0,
  usado_em date NOT NULL,
  liberado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academia_dayuse_busca_idx
  ON public.academia_dayuse (partner_id, cpf_hash, usado_em DESC);

ALTER TABLE public.academia_dayuse ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_dayuse_acesso ON public.academia_dayuse;
CREATE POLICY academia_dayuse_acesso ON public.academia_dayuse
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- 2. Pode entrar? ------------------------------------------------------------
-- Aplica a regra da academia. Nao registra nada: so responde.

CREATE OR REPLACE FUNCTION public.academia_dayuse_avaliar(p_partner_id uuid, p_cpf text)
RETURNS TABLE (decisao text, motivo text, usos integer, ultimo_uso date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_regra text;
  v_tz text;
  v_hoje date;
  v_hash text;
  v_usos integer;
  v_ultimo date;
  v_no_mes integer;
BEGIN
  SELECT COALESCE(c.regra_dayuse, 'uma_vez_na_vida'), COALESCE(c.timezone, 'America/Sao_Paulo')
    INTO v_regra, v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;

  v_regra := COALESCE(v_regra, 'uma_vez_na_vida');
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  IF length(regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g')) <> 11 THEN
    RETURN QUERY SELECT 'negado'::text, 'cpf_invalido'::text, 0, NULL::date;
    RETURN;
  END IF;

  v_hash := public.academia_cpf_hash(p_partner_id, p_cpf);

  SELECT count(*)::integer, max(d.usado_em)
    INTO v_usos, v_ultimo
    FROM public.academia_dayuse d
   WHERE d.partner_id = p_partner_id AND d.cpf_hash = v_hash;

  IF v_regra = 'desativado' THEN
    RETURN QUERY SELECT 'negado'::text, 'dayuse_desativado'::text, v_usos, v_ultimo;
    RETURN;
  END IF;

  IF v_regra = 'uma_vez_na_vida' AND v_usos > 0 THEN
    RETURN QUERY SELECT 'negado'::text, 'ja_usou'::text, v_usos, v_ultimo;
    RETURN;
  END IF;

  IF v_regra = 'uma_vez_por_mes' THEN
    -- mes-calendario no fuso da academia, nao ultimos 30 dias
    SELECT count(*)::integer INTO v_no_mes
      FROM public.academia_dayuse d
     WHERE d.partner_id = p_partner_id
       AND d.cpf_hash = v_hash
       AND date_trunc('month', d.usado_em) = date_trunc('month', v_hoje);
    IF v_no_mes > 0 THEN
      RETURN QUERY SELECT 'negado'::text, 'ja_usou_no_mes'::text, v_usos, v_ultimo;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT 'liberado'::text, 'dayuse_permitido'::text, v_usos, v_ultimo;
END;
$$;

-- 3. Registrar o uso ---------------------------------------------------------
-- Reavalia a regra dentro da propria funcao: sem isso, duas recepcionistas
-- clicando ao mesmo tempo passariam as duas.

CREATE OR REPLACE FUNCTION public.academia_dayuse_registrar(
  p_partner_id uuid,
  p_cpf text,
  p_nome text,
  p_telefone text,
  p_tipo text,
  p_valor numeric,
  p_forma_pagamento text,
  p_taxa_percentual numeric,
  p_taxa_valor numeric,
  p_valor_liquido numeric,
  p_liberado_por uuid,
  p_observacao text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_decisao text;
  v_motivo text;
  v_tz text;
  v_id uuid;
  v_digitos text := regexp_replace(COALESCE(p_cpf, ''), '\D', '', 'g');
BEGIN
  SELECT a.decisao, a.motivo INTO v_decisao, v_motivo
    FROM public.academia_dayuse_avaliar(p_partner_id, p_cpf) a;

  IF v_decisao <> 'liberado' THEN
    RAISE EXCEPTION 'Day-use negado: %', v_motivo USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');

  INSERT INTO public.academia_dayuse (
    partner_id, cpf_hash, cpf_final, nome, telefone, tipo, valor, forma_pagamento,
    taxa_percentual, taxa_valor, valor_liquido, usado_em, liberado_por, observacao
  ) VALUES (
    p_partner_id,
    public.academia_cpf_hash(p_partner_id, p_cpf),
    right(v_digitos, 3),
    p_nome,
    NULLIF(trim(COALESCE(p_telefone, '')), ''),
    COALESCE(p_tipo, 'day_use'),
    COALESCE(p_valor, 0),
    NULLIF(trim(COALESCE(p_forma_pagamento, '')), ''),
    COALESCE(p_taxa_percentual, 0),
    COALESCE(p_taxa_valor, 0),
    COALESCE(p_valor_liquido, 0),
    (now() AT TIME ZONE v_tz)::date,
    p_liberado_por,
    NULLIF(trim(COALESCE(p_observacao, '')), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_cpf_hash(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_dayuse_avaliar(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_dayuse_registrar(uuid, text, text, text, text, numeric, text, numeric, numeric, numeric, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.academia_cpf_hash(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_dayuse_avaliar(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_dayuse_registrar(uuid, text, text, text, text, numeric, text, numeric, numeric, numeric, uuid, text) TO authenticated, service_role;
