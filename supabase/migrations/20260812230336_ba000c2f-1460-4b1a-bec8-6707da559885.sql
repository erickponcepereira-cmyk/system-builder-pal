-- Helper: master admin atual
CREATE OR REPLACE FUNCTION public.is_master_admin_atual()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = auth.uid() AND COALESCE(p.is_master_admin, false)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_master_admin_atual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_master_admin_atual() TO authenticated, service_role;

-- 1) Mensalidades de academia
CREATE TABLE public.academia_mensalidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  plano text NOT NULL,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  valido_ate date NOT NULL,
  origem text NOT NULL DEFAULT 'externa' CHECK (origem IN ('interna','externa')),
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('dinheiro','pix','cartao_credito','cartao_debito','transferencia','outro')),
  taxa_percentual numeric(6,4) NOT NULL DEFAULT 0,
  taxa_valor numeric(12,2) NOT NULL DEFAULT 0,
  valor_liquido numeric(12,2) NOT NULL DEFAULT 0,
  registrado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_academia_mensalidades_partner ON public.academia_mensalidades(partner_id);
CREATE INDEX idx_academia_mensalidades_student ON public.academia_mensalidades(partner_id, student_id, valido_ate DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.academia_mensalidades TO authenticated;
GRANT ALL ON public.academia_mensalidades TO service_role;
ALTER TABLE public.academia_mensalidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academia_mensalidades_select" ON public.academia_mensalidades FOR SELECT TO authenticated
  USING (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));
CREATE POLICY "academia_mensalidades_insert" ON public.academia_mensalidades FOR INSERT TO authenticated
  WITH CHECK (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));
CREATE POLICY "academia_mensalidades_update" ON public.academia_mensalidades FOR UPDATE TO authenticated
  USING (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()))
  WITH CHECK (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));
CREATE POLICY "academia_mensalidades_delete" ON public.academia_mensalidades FOR DELETE TO authenticated
  USING (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));

CREATE TRIGGER trg_academia_mensalidades_updated_at BEFORE UPDATE ON public.academia_mensalidades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Configuração de acesso da academia
CREATE TABLE public.partner_acesso_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL UNIQUE REFERENCES public.partners(id) ON DELETE CASCADE,
  dias_carencia integer NOT NULL DEFAULT 3 CHECK (dias_carencia >= 0),
  exige_senha_liberacao boolean NOT NULL DEFAULT false,
  regra_dayuse text NOT NULL DEFAULT 'uma_vez_na_vida'
    CHECK (regra_dayuse IN ('uma_vez_na_vida','uma_vez_por_mes','livre_com_registro','desativado')),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  modelo_catraca text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_acesso_config TO authenticated;
GRANT ALL ON public.partner_acesso_config TO service_role;
ALTER TABLE public.partner_acesso_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_acesso_config_select" ON public.partner_acesso_config FOR SELECT TO authenticated
  USING (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));
CREATE POLICY "partner_acesso_config_insert" ON public.partner_acesso_config FOR INSERT TO authenticated
  WITH CHECK (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));
CREATE POLICY "partner_acesso_config_update" ON public.partner_acesso_config FOR UPDATE TO authenticated
  USING (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()))
  WITH CHECK (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));
CREATE POLICY "partner_acesso_config_delete" ON public.partner_acesso_config FOR DELETE TO authenticated
  USING (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));

CREATE TRIGGER trg_partner_acesso_config_updated_at BEFORE UPDATE ON public.partner_acesso_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Taxas externas da academia
CREATE TABLE public.partner_taxas_externas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  forma_pagamento text NOT NULL CHECK (forma_pagamento IN ('dinheiro','pix','cartao_credito','cartao_debito','transferencia','outro')),
  taxa_percentual numeric(6,4) NOT NULL DEFAULT 0,
  taxa_fixa numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, forma_pagamento)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_taxas_externas TO authenticated;
GRANT ALL ON public.partner_taxas_externas TO service_role;
ALTER TABLE public.partner_taxas_externas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "partner_taxas_externas_select" ON public.partner_taxas_externas FOR SELECT TO authenticated
  USING (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));
CREATE POLICY "partner_taxas_externas_insert" ON public.partner_taxas_externas FOR INSERT TO authenticated
  WITH CHECK (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));
CREATE POLICY "partner_taxas_externas_update" ON public.partner_taxas_externas FOR UPDATE TO authenticated
  USING (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()))
  WITH CHECK (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));
CREATE POLICY "partner_taxas_externas_delete" ON public.partner_taxas_externas FOR DELETE TO authenticated
  USING (public.is_master_admin_atual() OR partner_id IN (SELECT public.current_partner_ids()));

CREATE TRIGGER trg_partner_taxas_externas_updated_at BEFORE UPDATE ON public.partner_taxas_externas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Avaliação de acesso
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
   WHERE m.partner_id = p_partner_id AND m.student_id = p_student_id;

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