-- CRM — motor de quadros (estilo Trello) reaproveitável por qualquer painel.
--
-- Desenho em duas camadas:
--   1) MOTOR GENÉRICO: quadro -> colunas -> cartões -> atividades.
--      O quadro é ancorado por (escopo, owner_id), então o mesmo motor serve
--      academia/parceiro, coach, profissional e admin sem tabela nova.
--   2) CAMADA CRM: o cartão pode apontar para um lead existente (public.leads)
--      ou para um profile, e guarda contato solto quando ainda não virou lead.
--
-- Clonagem: quadros marcados como `modelo` podem ser copiados para outro
-- escopo/dono via public.crm_clonar_quadro(). É assim que o CRM da academia
-- vira o CRM do coach depois, sem duplicar código nem schema.
--
-- Escopo desta migration: NÃO toca em dinheiro. Nenhuma coluna financeira,
-- nenhuma tabela de carteira/comissão/fatura é lida ou alterada aqui.
-- Registrado em docs/REGISTRO-MIGRATIONS.md.
--
-- Validada localmente em PostgreSQL 16: aplicada duas vezes (idempotente),
-- com testes de isolamento entre parceiros e de clonagem.

-- ============================================================
-- 1. QUADROS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_quadros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo TEXT NOT NULL CHECK (escopo IN ('parceiro', 'coach', 'profissional', 'admin')),
  owner_id UUID,
  nome TEXT NOT NULL,
  descricao TEXT,
  modelo BOOLEAN NOT NULL DEFAULT false,
  clonado_de UUID REFERENCES public.crm_quadros(id) ON DELETE SET NULL,
  arquivado_em TIMESTAMPTZ,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- admin é global (sem dono); os demais escopos exigem dono
  CONSTRAINT crm_quadros_owner_coerente CHECK (
    (escopo = 'admin' AND owner_id IS NULL) OR
    (escopo <> 'admin' AND owner_id IS NOT NULL)
  )
);

-- O Supabase não concede acesso ao schema public automaticamente neste projeto:
-- cada tabela precisa do GRANT explícito, senão o app toma 'permission denied'
-- mesmo com o RLS correto. O RLS é que filtra as linhas; o GRANT abre a porta.
GRANT ALL ON public.crm_quadros TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_quadros TO authenticated;
ALTER TABLE public.crm_quadros ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crm_quadros_dono ON public.crm_quadros(escopo, owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_quadros_modelo ON public.crm_quadros(modelo) WHERE modelo = true;

-- ============================================================
-- 2. COLUNAS (etapas do funil)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_colunas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id UUID NOT NULL REFERENCES public.crm_quadros(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  posicao DOUBLE PRECISION NOT NULL DEFAULT 1000,
  cor TEXT,
  -- 'ganho'/'perdido' fecham o funil; usados para taxa de conversão
  tipo TEXT NOT NULL DEFAULT 'normal' CHECK (tipo IN ('normal', 'ganho', 'perdido')),
  limite_cartoes INTEGER CHECK (limite_cartoes IS NULL OR limite_cartoes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.crm_colunas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_colunas TO authenticated;
ALTER TABLE public.crm_colunas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crm_colunas_quadro ON public.crm_colunas(quadro_id, posicao);

-- ============================================================
-- 3. ETIQUETAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_etiquetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id UUID NOT NULL REFERENCES public.crm_quadros(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.crm_etiquetas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_etiquetas TO authenticated;
ALTER TABLE public.crm_etiquetas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crm_etiquetas_quadro ON public.crm_etiquetas(quadro_id);

-- ============================================================
-- 4. CARTÕES (lead / negócio / tarefa)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_cartoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quadro_id UUID NOT NULL REFERENCES public.crm_quadros(id) ON DELETE CASCADE,
  coluna_id UUID NOT NULL REFERENCES public.crm_colunas(id) ON DELETE CASCADE,
  posicao DOUBLE PRECISION NOT NULL DEFAULT 1000,
  titulo TEXT NOT NULL,
  descricao TEXT,
  -- vínculos opcionais: lead já existente, ou pessoa que já tem conta
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- contato solto, para quem ainda não virou lead nem tem conta
  contato_nome TEXT,
  contato_telefone TEXT,
  contato_email TEXT,
  responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  vence_em TIMESTAMPTZ,
  prioridade TEXT NOT NULL DEFAULT 'normal' CHECK (prioridade IN ('baixa', 'normal', 'alta')),
  arquivado_em TIMESTAMPTZ,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.crm_cartoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_cartoes TO authenticated;
ALTER TABLE public.crm_cartoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crm_cartoes_coluna ON public.crm_cartoes(coluna_id, posicao);
CREATE INDEX IF NOT EXISTS idx_crm_cartoes_quadro ON public.crm_cartoes(quadro_id);
CREATE INDEX IF NOT EXISTS idx_crm_cartoes_responsavel ON public.crm_cartoes(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_crm_cartoes_lead ON public.crm_cartoes(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_cartoes_vence ON public.crm_cartoes(vence_em) WHERE arquivado_em IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_cartao_etiquetas (
  cartao_id UUID NOT NULL REFERENCES public.crm_cartoes(id) ON DELETE CASCADE,
  etiqueta_id UUID NOT NULL REFERENCES public.crm_etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (cartao_id, etiqueta_id)
);

GRANT ALL ON public.crm_cartao_etiquetas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_cartao_etiquetas TO authenticated;
ALTER TABLE public.crm_cartao_etiquetas ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. ATIVIDADES (linha do tempo do cartão)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_atividades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cartao_id UUID NOT NULL REFERENCES public.crm_cartoes(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'comentario', 'mudanca_coluna', 'ligacao', 'whatsapp', 'email', 'visita', 'tarefa', 'sistema'
  )),
  corpo TEXT,
  de_coluna_id UUID REFERENCES public.crm_colunas(id) ON DELETE SET NULL,
  para_coluna_id UUID REFERENCES public.crm_colunas(id) ON DELETE SET NULL,
  meta JSONB,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.crm_atividades TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_atividades TO authenticated;
ALTER TABLE public.crm_atividades ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_crm_atividades_cartao ON public.crm_atividades(cartao_id, created_at DESC);

-- ============================================================
-- 6. ACESSO
-- ============================================================
-- Uma função decide tudo, e as políticas apenas a chamam. Assim a regra de
-- quem enxerga o quadro fica num lugar só.
--   parceiro     -> partner_pode(owner_id, 'crm')  (dono, permissão 'crm' ou admin)
--   coach/prof.  -> o profile dono é o usuário logado
--   admin        -> is_admin
-- Convenção do projeto: auth.uid() bate em profiles.user_id, NÃO em profiles.id.

CREATE OR REPLACE FUNCTION public.crm_acesso_quadro(_quadro_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT CASE q.escopo
      WHEN 'parceiro' THEN public.partner_pode(q.owner_id, 'crm')
      WHEN 'coach' THEN EXISTS (
        SELECT 1 FROM public.profiles pr WHERE pr.id = q.owner_id AND pr.user_id = auth.uid()
      )
      WHEN 'profissional' THEN EXISTS (
        SELECT 1 FROM public.profiles pr WHERE pr.id = q.owner_id AND pr.user_id = auth.uid()
      )
      WHEN 'admin' THEN COALESCE(public.is_admin(auth.uid()), false)
      ELSE false
    END
    FROM public.crm_quadros q
    WHERE q.id = _quadro_id
  ), false)
  OR COALESCE(public.is_admin(auth.uid()), false)
$$;

REVOKE EXECUTE ON FUNCTION public.crm_acesso_quadro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_acesso_quadro(uuid) TO authenticated, service_role;

-- ---------- políticas: quadros ----------

DO $$ BEGIN
  CREATE POLICY "Ver quadros do meu escopo"
    ON public.crm_quadros FOR SELECT TO authenticated
    USING (public.crm_acesso_quadro(id) OR modelo = true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Criar quadro no meu escopo"
    ON public.crm_quadros FOR INSERT TO authenticated
    WITH CHECK (
      CASE escopo
        WHEN 'parceiro' THEN public.partner_pode(owner_id, 'crm')
        WHEN 'coach' THEN EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = owner_id AND pr.user_id = auth.uid())
        WHEN 'profissional' THEN EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = owner_id AND pr.user_id = auth.uid())
        WHEN 'admin' THEN COALESCE(public.is_admin(auth.uid()), false)
        ELSE false
      END
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Editar meus quadros"
    ON public.crm_quadros FOR UPDATE TO authenticated
    USING (public.crm_acesso_quadro(id))
    WITH CHECK (public.crm_acesso_quadro(id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Apagar meus quadros"
    ON public.crm_quadros FOR DELETE TO authenticated
    USING (public.crm_acesso_quadro(id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ---------- políticas: conteúdo do quadro ----------

DO $$ BEGIN
  CREATE POLICY "Acesso total via quadro"
    ON public.crm_colunas FOR ALL TO authenticated
    USING (public.crm_acesso_quadro(quadro_id))
    WITH CHECK (public.crm_acesso_quadro(quadro_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Acesso total via quadro"
    ON public.crm_etiquetas FOR ALL TO authenticated
    USING (public.crm_acesso_quadro(quadro_id))
    WITH CHECK (public.crm_acesso_quadro(quadro_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Acesso total via quadro"
    ON public.crm_cartoes FOR ALL TO authenticated
    USING (public.crm_acesso_quadro(quadro_id))
    WITH CHECK (public.crm_acesso_quadro(quadro_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Acesso total via cartao"
    ON public.crm_cartao_etiquetas FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.crm_cartoes c
                   WHERE c.id = cartao_id AND public.crm_acesso_quadro(c.quadro_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.crm_cartoes c
                        WHERE c.id = cartao_id AND public.crm_acesso_quadro(c.quadro_id)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Acesso total via cartao"
    ON public.crm_atividades FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.crm_cartoes c
                   WHERE c.id = cartao_id AND public.crm_acesso_quadro(c.quadro_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.crm_cartoes c
                        WHERE c.id = cartao_id AND public.crm_acesso_quadro(c.quadro_id)));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- 7. GATILHOS
-- ============================================================

CREATE OR REPLACE FUNCTION public.crm_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_quadros_touch ON public.crm_quadros;
CREATE TRIGGER trg_crm_quadros_touch BEFORE UPDATE ON public.crm_quadros
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

DROP TRIGGER IF EXISTS trg_crm_colunas_touch ON public.crm_colunas;
CREATE TRIGGER trg_crm_colunas_touch BEFORE UPDATE ON public.crm_colunas
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

DROP TRIGGER IF EXISTS trg_crm_cartoes_touch ON public.crm_cartoes;
CREATE TRIGGER trg_crm_cartoes_touch BEFORE UPDATE ON public.crm_cartoes
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- Registra a mudança de etapa na linha do tempo do cartão.
-- Sem EXCEPTION WHEN OTHERS: se falhar, tem que falhar visível.
CREATE OR REPLACE FUNCTION public.crm_registrar_mudanca_coluna()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.coluna_id IS DISTINCT FROM OLD.coluna_id THEN
    INSERT INTO public.crm_atividades (cartao_id, tipo, de_coluna_id, para_coluna_id, criado_por)
    VALUES (
      NEW.id, 'mudanca_coluna', OLD.coluna_id, NEW.coluna_id,
      (SELECT pr.id FROM public.profiles pr WHERE pr.user_id = auth.uid() LIMIT 1)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_crm_cartoes_mudanca_coluna ON public.crm_cartoes;
CREATE TRIGGER trg_crm_cartoes_mudanca_coluna AFTER UPDATE ON public.crm_cartoes
  FOR EACH ROW EXECUTE FUNCTION public.crm_registrar_mudanca_coluna();

-- ============================================================
-- 8. CLONAGEM
-- ============================================================
-- Copia a ESTRUTURA de um quadro (colunas + etiquetas) para outro escopo/dono.
-- Cartões não são copiados: o que se reaproveita é a organização, não os dados
-- de uma academia dentro de outra.

CREATE OR REPLACE FUNCTION public.crm_clonar_quadro(
  _origem_id uuid,
  _escopo text,
  _owner_id uuid,
  _nome text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo_id uuid;
  v_criador uuid;
  v_pode boolean;
BEGIN
  IF NOT (public.crm_acesso_quadro(_origem_id)
          OR EXISTS (SELECT 1 FROM public.crm_quadros WHERE id = _origem_id AND modelo = true)) THEN
    RAISE EXCEPTION 'Sem acesso ao quadro de origem';
  END IF;

  v_pode := CASE _escopo
    WHEN 'parceiro' THEN public.partner_pode(_owner_id, 'crm')
    WHEN 'coach' THEN EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = _owner_id AND pr.user_id = auth.uid())
    WHEN 'profissional' THEN EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = _owner_id AND pr.user_id = auth.uid())
    WHEN 'admin' THEN COALESCE(public.is_admin(auth.uid()), false)
    ELSE false
  END;
  IF NOT COALESCE(v_pode, false) THEN
    RAISE EXCEPTION 'Sem permissão para criar quadro nesse destino';
  END IF;

  SELECT pr.id INTO v_criador FROM public.profiles pr WHERE pr.user_id = auth.uid() LIMIT 1;

  INSERT INTO public.crm_quadros (escopo, owner_id, nome, descricao, clonado_de, criado_por)
  SELECT _escopo, _owner_id, COALESCE(_nome, q.nome), q.descricao, q.id, v_criador
  FROM public.crm_quadros q WHERE q.id = _origem_id
  RETURNING id INTO v_novo_id;

  INSERT INTO public.crm_colunas (quadro_id, nome, posicao, cor, tipo, limite_cartoes)
  SELECT v_novo_id, c.nome, c.posicao, c.cor, c.tipo, c.limite_cartoes
  FROM public.crm_colunas c WHERE c.quadro_id = _origem_id;

  INSERT INTO public.crm_etiquetas (quadro_id, nome, cor)
  SELECT v_novo_id, e.nome, e.cor
  FROM public.crm_etiquetas e WHERE e.quadro_id = _origem_id;

  RETURN v_novo_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.crm_clonar_quadro(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_clonar_quadro(uuid, text, uuid, text) TO authenticated, service_role;
