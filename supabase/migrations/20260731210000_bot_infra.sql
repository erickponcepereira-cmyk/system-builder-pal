-- ROBÔ — atendimento automático por WhatsApp.
--
-- Mesma arquitetura do CRM: tudo ancorado em (escopo, owner_id), então o robô
-- serve academia/parceiro, coach, profissional e admin sem tabela nova, e os
-- fluxos podem ser clonados entre painéis.
--
-- Ponte com o CRM: a conversa aponta para um cartão (crm_cartoes). O que o robô
-- descobre vira lead no funil sem digitação manual.
--
-- IMPORTANTE — credenciais: a sessão do WhatsApp (as chaves que autenticam o
-- número) NÃO fica aqui. Ela vive no conector, fora do banco. Aqui guardamos
-- apenas estado de conexão e o segredo de webhook, que serve para o conector
-- provar que a chamada é dele.
--
-- Não toca em dinheiro. Registrado em docs/REGISTRO-MIGRATIONS.md.
--
-- Validada em PostgreSQL 16: aplicada duas vezes (idempotente), com testes de
-- isolamento entre parceiros, idempotência de webhook e clonagem de fluxo.

-- ============================================================
-- 1. ACESSO (uma regra só, reutilizada por tudo)
-- ============================================================
-- is_admin vem primeiro de propósito: o admin precisa conseguir configurar o
-- robô em nome de um parceiro ou profissional. (Foi exatamente o ajuste que
-- faltou na primeira versão da política do CRM.)

CREATE OR REPLACE FUNCTION public.bot_acesso_dono(_escopo text, _owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE(public.is_admin(auth.uid()), false)
  OR CASE _escopo
    WHEN 'parceiro' THEN public.partner_pode(_owner_id, 'robo')
    WHEN 'coach' THEN EXISTS (
      SELECT 1 FROM public.profiles pr WHERE pr.id = _owner_id AND pr.user_id = auth.uid())
    WHEN 'profissional' THEN EXISTS (
      SELECT 1 FROM public.profiles pr WHERE pr.id = _owner_id AND pr.user_id = auth.uid())
    WHEN 'admin' THEN COALESCE(public.is_admin(auth.uid()), false)
    ELSE false
  END
$fn$;

REVOKE EXECUTE ON FUNCTION public.bot_acesso_dono(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_acesso_dono(text, uuid) TO authenticated, service_role;

-- ============================================================
-- 2. CONEXÕES (um número de WhatsApp por unidade)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_conexoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo TEXT NOT NULL CHECK (escopo IN ('parceiro', 'coach', 'profissional', 'admin')),
  owner_id UUID,
  nome TEXT NOT NULL,
  -- 'nao_oficial' = conector web (sessão do próprio número); 'oficial' = API do WhatsApp Business
  provedor TEXT NOT NULL DEFAULT 'nao_oficial' CHECK (provedor IN ('nao_oficial', 'oficial')),
  numero TEXT,
  status TEXT NOT NULL DEFAULT 'desconectado'
    CHECK (status IN ('desconectado', 'aguardando_qr', 'conectado', 'erro')),
  status_detalhe TEXT,
  -- o conector assina cada webhook com este segredo
  -- 64 caracteres sem depender da extensao pgcrypto
  webhook_segredo TEXT NOT NULL DEFAULT (
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  ),
  conectado_em TIMESTAMPTZ,
  visto_em TIMESTAMPTZ,
  arquivado_em TIMESTAMPTZ,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bot_conexoes_owner_coerente CHECK (
    (escopo = 'admin' AND owner_id IS NULL) OR
    (escopo <> 'admin' AND owner_id IS NOT NULL)
  )
);

GRANT ALL ON public.bot_conexoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_conexoes TO authenticated;
ALTER TABLE public.bot_conexoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bot_conexoes_dono ON public.bot_conexoes(escopo, owner_id);

-- ============================================================
-- 3. FLUXOS (clonáveis entre painéis)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_fluxos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo TEXT NOT NULL CHECK (escopo IN ('parceiro', 'coach', 'profissional', 'admin')),
  owner_id UUID,
  nome TEXT NOT NULL,
  descricao TEXT,
  gatilho_tipo TEXT NOT NULL DEFAULT 'primeira_mensagem'
    CHECK (gatilho_tipo IN ('primeira_mensagem', 'palavra_chave', 'manual')),
  gatilho_valor TEXT,
  ativo BOOLEAN NOT NULL DEFAULT false,
  modelo BOOLEAN NOT NULL DEFAULT false,
  clonado_de UUID REFERENCES public.bot_fluxos(id) ON DELETE SET NULL,
  -- referência para bot_passos; a FK é criada depois que a tabela existir
  passo_inicial_id UUID,
  arquivado_em TIMESTAMPTZ,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bot_fluxos_owner_coerente CHECK (
    (escopo = 'admin' AND owner_id IS NULL) OR
    (escopo <> 'admin' AND owner_id IS NOT NULL)
  ),
  CONSTRAINT bot_fluxos_gatilho_coerente CHECK (
    gatilho_tipo <> 'palavra_chave' OR (gatilho_valor IS NOT NULL AND gatilho_valor <> '')
  )
);

GRANT ALL ON public.bot_fluxos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_fluxos TO authenticated;
ALTER TABLE public.bot_fluxos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bot_fluxos_dono ON public.bot_fluxos(escopo, owner_id);
CREATE INDEX IF NOT EXISTS idx_bot_fluxos_modelo ON public.bot_fluxos(modelo) WHERE modelo = true;
CREATE INDEX IF NOT EXISTS idx_bot_fluxos_ativo ON public.bot_fluxos(ativo) WHERE ativo = true;

-- ============================================================
-- 4. PASSOS E OPÇÕES (o desenho da conversa)
-- ============================================================
-- `chave` é o identificador estável do passo dentro do fluxo. É por ela que a
-- clonagem religa os ponteiros no destino, sem precisar mapear UUID por UUID.

CREATE TABLE IF NOT EXISTS public.bot_passos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_id UUID NOT NULL REFERENCES public.bot_fluxos(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'mensagem' CHECK (tipo IN (
    'mensagem',    -- só fala e segue
    'pergunta',    -- fala e espera resposta (usa bot_opcoes)
    'acao',        -- executa algo (ex.: criar cartão no CRM)
    'transferir',  -- passa para atendimento humano
    'encerrar'
  )),
  conteudo TEXT,
  posicao DOUBLE PRECISION NOT NULL DEFAULT 1000,
  proximo_passo_id UUID REFERENCES public.bot_passos(id) ON DELETE SET NULL,
  acao TEXT,
  acao_params JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bot_passos_chave_unica UNIQUE (fluxo_id, chave)
);

GRANT ALL ON public.bot_passos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_passos TO authenticated;
ALTER TABLE public.bot_passos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bot_passos_fluxo ON public.bot_passos(fluxo_id, posicao);

-- agora que bot_passos existe, amarra o passo inicial do fluxo
DO $do$ BEGIN
  ALTER TABLE public.bot_fluxos
    ADD CONSTRAINT bot_fluxos_passo_inicial_fk
    FOREIGN KEY (passo_inicial_id) REFERENCES public.bot_passos(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE TABLE IF NOT EXISTS public.bot_opcoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passo_id UUID NOT NULL REFERENCES public.bot_passos(id) ON DELETE CASCADE,
  rotulo TEXT NOT NULL,
  -- o que a pessoa digita para escolher (ex.: '1' ou 'planos')
  gatilho TEXT NOT NULL,
  proximo_passo_id UUID REFERENCES public.bot_passos(id) ON DELETE SET NULL,
  posicao DOUBLE PRECISION NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_opcoes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_opcoes TO authenticated;
ALTER TABLE public.bot_opcoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bot_opcoes_passo ON public.bot_opcoes(passo_id, posicao);

-- ============================================================
-- 5. CONVERSAS E MENSAGENS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conexao_id UUID NOT NULL REFERENCES public.bot_conexoes(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  nome TEXT,
  fluxo_id UUID REFERENCES public.bot_fluxos(id) ON DELETE SET NULL,
  passo_atual_id UUID REFERENCES public.bot_passos(id) ON DELETE SET NULL,
  estado TEXT NOT NULL DEFAULT 'bot' CHECK (estado IN ('bot', 'humano', 'encerrada')),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- ponte com o CRM: o que o robô descobre vira lead no funil
  cartao_id UUID REFERENCES public.crm_cartoes(id) ON DELETE SET NULL,
  ultima_mensagem_em TIMESTAMPTZ,
  encerrada_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bot_conversas_unica UNIQUE (conexao_id, telefone)
);

GRANT ALL ON public.bot_conversas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_conversas TO authenticated;
ALTER TABLE public.bot_conversas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bot_conversas_conexao ON public.bot_conversas(conexao_id, ultima_mensagem_em DESC);
CREATE INDEX IF NOT EXISTS idx_bot_conversas_estado ON public.bot_conversas(estado) WHERE estado = 'humano';
CREATE INDEX IF NOT EXISTS idx_bot_conversas_cartao ON public.bot_conversas(cartao_id);

CREATE TABLE IF NOT EXISTS public.bot_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID NOT NULL REFERENCES public.bot_conversas(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  tipo TEXT NOT NULL DEFAULT 'texto'
    CHECK (tipo IN ('texto', 'imagem', 'audio', 'video', 'documento', 'sistema')),
  corpo TEXT,
  midia_url TEXT,
  -- id da mensagem no WhatsApp: webhook repete, e isto evita duplicar
  wa_id TEXT,
  enviada_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Fila de saida. O PC da academia fica atras de NAT: a nuvem nao alcanca ele.
  -- Entao o conector BUSCA o que esta 'pendente' e devolve 'enviada' ou 'erro'.
  status TEXT NOT NULL DEFAULT 'recebida'
    CHECK (status IN ('recebida', 'pendente', 'enviada', 'erro')),
  tentativas SMALLINT NOT NULL DEFAULT 0,
  enviada_em TIMESTAMPTZ,
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bot_mensagens_status_coerente CHECK (
    (direcao = 'entrada' AND status = 'recebida') OR direcao = 'saida'
  )
);

GRANT ALL ON public.bot_mensagens TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_mensagens TO authenticated;
ALTER TABLE public.bot_mensagens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bot_mensagens_conversa ON public.bot_mensagens(conversa_id, created_at DESC);
-- o conector consulta esta fila a cada poucos segundos: indice enxuto
CREATE INDEX IF NOT EXISTS idx_bot_mensagens_fila
  ON public.bot_mensagens(conversa_id, created_at) WHERE status = 'pendente';
-- idempotência do webhook: a mesma mensagem do WhatsApp não entra duas vezes
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_mensagens_wa_id
  ON public.bot_mensagens(conversa_id, wa_id) WHERE wa_id IS NOT NULL;

-- ============================================================
-- 6. POLÍTICAS
-- ============================================================

CREATE OR REPLACE FUNCTION public.bot_acesso_fluxo(_fluxo_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT COALESCE((SELECT public.bot_acesso_dono(f.escopo, f.owner_id)
                   FROM public.bot_fluxos f WHERE f.id = _fluxo_id), false)
$fn$;

CREATE OR REPLACE FUNCTION public.bot_acesso_conexao(_conexao_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT COALESCE((SELECT public.bot_acesso_dono(c.escopo, c.owner_id)
                   FROM public.bot_conexoes c WHERE c.id = _conexao_id), false)
$fn$;

REVOKE EXECUTE ON FUNCTION public.bot_acesso_fluxo(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.bot_acesso_conexao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_acesso_fluxo(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bot_acesso_conexao(uuid) TO authenticated, service_role;

DO $do$ BEGIN
  CREATE POLICY "Ver conexoes do meu escopo" ON public.bot_conexoes FOR SELECT TO authenticated
    USING (public.bot_acesso_dono(escopo, owner_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY "Criar conexao no meu escopo" ON public.bot_conexoes FOR INSERT TO authenticated
    WITH CHECK (public.bot_acesso_dono(escopo, owner_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY "Editar minhas conexoes" ON public.bot_conexoes FOR UPDATE TO authenticated
    USING (public.bot_acesso_dono(escopo, owner_id))
    WITH CHECK (public.bot_acesso_dono(escopo, owner_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY "Apagar minhas conexoes" ON public.bot_conexoes FOR DELETE TO authenticated
    USING (public.bot_acesso_dono(escopo, owner_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY "Ver fluxos do meu escopo" ON public.bot_fluxos FOR SELECT TO authenticated
    USING (public.bot_acesso_dono(escopo, owner_id) OR modelo = true);
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY "Criar fluxo no meu escopo" ON public.bot_fluxos FOR INSERT TO authenticated
    WITH CHECK (public.bot_acesso_dono(escopo, owner_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY "Editar meus fluxos" ON public.bot_fluxos FOR UPDATE TO authenticated
    USING (public.bot_acesso_dono(escopo, owner_id))
    WITH CHECK (public.bot_acesso_dono(escopo, owner_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN
  CREATE POLICY "Apagar meus fluxos" ON public.bot_fluxos FOR DELETE TO authenticated
    USING (public.bot_acesso_dono(escopo, owner_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY "Acesso total via fluxo" ON public.bot_passos FOR ALL TO authenticated
    USING (public.bot_acesso_fluxo(fluxo_id))
    WITH CHECK (public.bot_acesso_fluxo(fluxo_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY "Acesso total via passo" ON public.bot_opcoes FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.bot_passos p
                   WHERE p.id = passo_id AND public.bot_acesso_fluxo(p.fluxo_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.bot_passos p
                        WHERE p.id = passo_id AND public.bot_acesso_fluxo(p.fluxo_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY "Acesso total via conexao" ON public.bot_conversas FOR ALL TO authenticated
    USING (public.bot_acesso_conexao(conexao_id))
    WITH CHECK (public.bot_acesso_conexao(conexao_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY "Acesso total via conversa" ON public.bot_mensagens FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.bot_conversas c
                   WHERE c.id = conversa_id AND public.bot_acesso_conexao(c.conexao_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.bot_conversas c
                        WHERE c.id = conversa_id AND public.bot_acesso_conexao(c.conexao_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- ============================================================
-- 7. GATILHOS
-- ============================================================

DROP TRIGGER IF EXISTS trg_bot_conexoes_touch ON public.bot_conexoes;
CREATE TRIGGER trg_bot_conexoes_touch BEFORE UPDATE ON public.bot_conexoes
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
DROP TRIGGER IF EXISTS trg_bot_fluxos_touch ON public.bot_fluxos;
CREATE TRIGGER trg_bot_fluxos_touch BEFORE UPDATE ON public.bot_fluxos
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
DROP TRIGGER IF EXISTS trg_bot_passos_touch ON public.bot_passos;
CREATE TRIGGER trg_bot_passos_touch BEFORE UPDATE ON public.bot_passos
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
DROP TRIGGER IF EXISTS trg_bot_conversas_touch ON public.bot_conversas;
CREATE TRIGGER trg_bot_conversas_touch BEFORE UPDATE ON public.bot_conversas
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- toda mensagem atualiza o relógio da conversa, para ordenar a caixa de entrada
CREATE OR REPLACE FUNCTION public.bot_marcar_ultima_mensagem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  UPDATE public.bot_conversas
  SET ultima_mensagem_em = NEW.created_at
  WHERE id = NEW.conversa_id;
  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS trg_bot_mensagens_relogio ON public.bot_mensagens;
CREATE TRIGGER trg_bot_mensagens_relogio AFTER INSERT ON public.bot_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.bot_marcar_ultima_mensagem();

-- ============================================================
-- 8. CLONAGEM DE FLUXO
-- ============================================================
-- Copia fluxo + passos + opções para outro escopo/dono. Os ponteiros entre
-- passos são religados pela `chave`, que é estável dentro do fluxo — por isso
-- não é preciso mapear UUID a UUID. Conversas não são copiadas: reaproveita-se
-- o desenho do atendimento, nunca o histórico de uma unidade dentro de outra.

CREATE OR REPLACE FUNCTION public.bot_clonar_fluxo(
  _origem_id uuid,
  _escopo text,
  _owner_id uuid,
  _nome text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_novo uuid;
  v_criador uuid;
BEGIN
  IF NOT (public.bot_acesso_fluxo(_origem_id)
          OR EXISTS (SELECT 1 FROM public.bot_fluxos WHERE id = _origem_id AND modelo = true)) THEN
    RAISE EXCEPTION 'Sem acesso ao fluxo de origem';
  END IF;

  IF NOT public.bot_acesso_dono(_escopo, _owner_id) THEN
    RAISE EXCEPTION 'Sem permissao para criar fluxo nesse destino';
  END IF;

  SELECT pr.id INTO v_criador FROM public.profiles pr WHERE pr.user_id = auth.uid() LIMIT 1;

  -- o clone nasce desligado, para ninguem publicar sem revisar
  INSERT INTO public.bot_fluxos
    (escopo, owner_id, nome, descricao, gatilho_tipo, gatilho_valor, ativo, clonado_de, criado_por)
  SELECT _escopo, _owner_id, COALESCE(_nome, f.nome), f.descricao,
         f.gatilho_tipo, f.gatilho_valor, false, f.id, v_criador
  FROM public.bot_fluxos f WHERE f.id = _origem_id
  RETURNING id INTO v_novo;

  INSERT INTO public.bot_passos (fluxo_id, chave, tipo, conteudo, posicao, acao, acao_params)
  SELECT v_novo, p.chave, p.tipo, p.conteudo, p.posicao, p.acao, p.acao_params
  FROM public.bot_passos p WHERE p.fluxo_id = _origem_id;

  -- religa proximo_passo_id pela chave
  UPDATE public.bot_passos np
  SET proximo_passo_id = destino.id
  FROM public.bot_passos op
  JOIN public.bot_passos op_alvo ON op_alvo.id = op.proximo_passo_id
  JOIN public.bot_passos destino ON destino.fluxo_id = v_novo AND destino.chave = op_alvo.chave
  WHERE op.fluxo_id = _origem_id
    AND np.fluxo_id = v_novo
    AND np.chave = op.chave;

  -- copia as opções, religando origem e destino pela chave
  INSERT INTO public.bot_opcoes (passo_id, rotulo, gatilho, proximo_passo_id, posicao)
  SELECT np.id, o.rotulo, o.gatilho, destino.id, o.posicao
  FROM public.bot_opcoes o
  JOIN public.bot_passos op ON op.id = o.passo_id AND op.fluxo_id = _origem_id
  JOIN public.bot_passos np ON np.fluxo_id = v_novo AND np.chave = op.chave
  LEFT JOIN public.bot_passos op_alvo ON op_alvo.id = o.proximo_passo_id
  LEFT JOIN public.bot_passos destino ON destino.fluxo_id = v_novo AND destino.chave = op_alvo.chave;

  -- e o passo inicial
  UPDATE public.bot_fluxos nf
  SET passo_inicial_id = destino.id
  FROM public.bot_fluxos origem
  JOIN public.bot_passos inicial ON inicial.id = origem.passo_inicial_id
  JOIN public.bot_passos destino ON destino.fluxo_id = v_novo AND destino.chave = inicial.chave
  WHERE origem.id = _origem_id AND nf.id = v_novo;

  RETURN v_novo;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.bot_clonar_fluxo(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_clonar_fluxo(uuid, text, uuid, text) TO authenticated, service_role;
