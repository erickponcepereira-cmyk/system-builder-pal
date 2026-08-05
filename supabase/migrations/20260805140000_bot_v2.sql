-- ROBÔ v2 — rotação de números, verificação por WhatsApp, disparos e CRM.
--
-- O que entra e por quê:
--
-- 1) ROTAÇÃO DE NÚMEROS. Chip em API não oficial é descartável: um dia bloqueia.
--    Em vez de tratar isso como falha, o sistema assume que vai acontecer e
--    troca sozinho para o próximo número saudável. Cada conexão tem prioridade,
--    limite diário (para não queimar o chip) e contador de falhas.
--
-- 2) VERIFICAÇÃO POR WHATSAPP INVERTIDA. Não somos nós que mandamos o código:
--    a pessoa manda. Ela recebe um link com um token, aperta enviar, e o robô
--    confirma. Isso evita mensagem fria (que é o que bloqueia chip), aquece o
--    número com conversa de verdade, e já entrega o telefone verificado.
--
-- 3) DISPAROS. Campanhas (desafio, avaliação, promoção) com alvos e estado por
--    pessoa, para saber quem recebeu e quem falhou.
--
-- 4) LIGAÇÃO COM O CRM. Conversa nova vira cartão no funil do dono, sozinha.
--
-- Não toca em dinheiro. Registrado em docs/REGISTRO-MIGRATIONS.md.
-- Validada em PostgreSQL 16: aplicada duas vezes (idempotente), com testes de
-- rotação, verificação e vínculo com o CRM.

-- ============================================================
-- 1. ROTAÇÃO DE NÚMEROS
-- ============================================================

ALTER TABLE public.bot_conexoes ADD COLUMN IF NOT EXISTS prioridade INTEGER NOT NULL DEFAULT 100;
ALTER TABLE public.bot_conexoes ADD COLUMN IF NOT EXISTS falhas_seguidas INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.bot_conexoes ADD COLUMN IF NOT EXISTS bloqueado_em TIMESTAMPTZ;
ALTER TABLE public.bot_conexoes ADD COLUMN IF NOT EXISTS bloqueado_motivo TEXT;
-- limite diário protege o chip; NULL = sem limite
ALTER TABLE public.bot_conexoes ADD COLUMN IF NOT EXISTS limite_diario INTEGER;
ALTER TABLE public.bot_conexoes ADD COLUMN IF NOT EXISTS enviadas_hoje INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.bot_conexoes ADD COLUMN IF NOT EXISTS contador_dia DATE;
-- número de plantão da plataforma (verificação, disparos), separado dos da academia
ALTER TABLE public.bot_conexoes ADD COLUMN IF NOT EXISTS uso TEXT NOT NULL DEFAULT 'atendimento';

DO $do$ BEGIN
  ALTER TABLE public.bot_conexoes
    ADD CONSTRAINT bot_conexoes_uso_valido CHECK (uso IN ('atendimento', 'plataforma'));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS idx_bot_conexoes_saudaveis
  ON public.bot_conexoes(escopo, owner_id, uso, prioridade)
  WHERE arquivado_em IS NULL AND bloqueado_em IS NULL;

-- Escolhe o melhor número vivo para enviar.
-- Regras: não arquivado, não bloqueado, conectado, o conector deu sinal nos
-- últimos 5 minutos, e ainda dentro do limite diário.
-- Desempate: menor prioridade primeiro, depois quem enviou menos hoje — assim a
-- carga se distribui entre os chips em vez de queimar um só.
CREATE OR REPLACE FUNCTION public.bot_escolher_conexao(
  _escopo text,
  _owner_id uuid,
  _uso text DEFAULT 'atendimento'
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT c.id
  FROM public.bot_conexoes c
  WHERE c.uso = _uso
    AND c.escopo = _escopo
    AND (c.owner_id = _owner_id OR (_owner_id IS NULL AND c.owner_id IS NULL))
    AND c.arquivado_em IS NULL
    AND c.bloqueado_em IS NULL
    AND c.status = 'conectado'
    AND c.visto_em > now() - interval '5 minutes'
    AND (
      c.limite_diario IS NULL
      OR c.contador_dia IS DISTINCT FROM CURRENT_DATE
      OR c.enviadas_hoje < c.limite_diario
    )
  ORDER BY c.prioridade,
           CASE WHEN c.contador_dia = CURRENT_DATE THEN c.enviadas_hoje ELSE 0 END,
           c.conectado_em NULLS LAST
  LIMIT 1
$fn$;

REVOKE EXECUTE ON FUNCTION public.bot_escolher_conexao(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_escolher_conexao(text, uuid, text) TO authenticated, service_role;

-- Marca um número como bloqueado. O próximo envio já sai por outro.
CREATE OR REPLACE FUNCTION public.bot_bloquear_conexao(_conexao_id uuid, _motivo text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  UPDATE public.bot_conexoes
  SET bloqueado_em = now(), bloqueado_motivo = left(COALESCE(_motivo, 'sem motivo'), 300), status = 'erro'
  WHERE id = _conexao_id
$fn$;

REVOKE EXECUTE ON FUNCTION public.bot_bloquear_conexao(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_bloquear_conexao(uuid, text) TO authenticated, service_role;

-- Conta um envio no chip, virando o contador quando muda o dia.
CREATE OR REPLACE FUNCTION public.bot_contar_envio(_conexao_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  UPDATE public.bot_conexoes
  SET enviadas_hoje = CASE WHEN contador_dia = CURRENT_DATE THEN enviadas_hoje + 1 ELSE 1 END,
      contador_dia = CURRENT_DATE
  WHERE id = _conexao_id
$fn$;

REVOKE EXECUTE ON FUNCTION public.bot_contar_envio(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_contar_envio(uuid) TO authenticated, service_role;

-- ============================================================
-- 2. VERIFICAÇÃO POR WHATSAPP (a pessoa manda, não a gente)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_verificacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- o que a pessoa vai enviar; curto e sem caracteres ambíguos
  token TEXT NOT NULL UNIQUE,
  finalidade TEXT NOT NULL DEFAULT 'cadastro'
    CHECK (finalidade IN ('cadastro', 'login', 'trocar_telefone', 'lead')),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT,
  -- preenchidos quando a mensagem chega
  telefone TEXT,
  nome_whatsapp TEXT,
  conexao_id UUID REFERENCES public.bot_conexoes(id) ON DELETE SET NULL,
  conversa_id UUID REFERENCES public.bot_conversas(id) ON DELETE SET NULL,
  verificado_em TIMESTAMPTZ,
  expira_em TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 minutes'),
  tentativas SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_verificacoes TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.bot_verificacoes TO authenticated;
ALTER TABLE public.bot_verificacoes ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bot_verificacoes_abertas
  ON public.bot_verificacoes(token) WHERE verificado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_bot_verificacoes_profile ON public.bot_verificacoes(profile_id);

-- a pessoa só enxerga as próprias verificações; quem cria de fato é o servidor
DO $do$ BEGIN
  CREATE POLICY "Ver minhas verificacoes" ON public.bot_verificacoes FOR SELECT TO authenticated
    USING (
      COALESCE(public.is_admin(auth.uid()), false)
      OR EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = profile_id AND pr.user_id = auth.uid())
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

-- Confere um token e marca como verificado. Usada pelo motor do robô quando
-- chega uma mensagem que parece um token.
CREATE OR REPLACE FUNCTION public.bot_confirmar_verificacao(
  _token text,
  _telefone text,
  _conexao_id uuid DEFAULT NULL,
  _conversa_id uuid DEFAULT NULL,
  _nome text DEFAULT NULL
)
RETURNS TABLE (ok boolean, motivo text, profile_id uuid, finalidade text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v public.bot_verificacoes%ROWTYPE;
BEGIN
  SELECT * INTO v FROM public.bot_verificacoes
  WHERE upper(token) = upper(trim(_token)) LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'token nao encontrado'::text, NULL::uuid, NULL::text; RETURN;
  END IF;
  IF v.verificado_em IS NOT NULL THEN
    RETURN QUERY SELECT false, 'ja usado'::text, v.profile_id, v.finalidade; RETURN;
  END IF;
  IF v.expira_em < now() THEN
    RETURN QUERY SELECT false, 'expirado'::text, v.profile_id, v.finalidade; RETURN;
  END IF;

  UPDATE public.bot_verificacoes
  SET verificado_em = now(),
      telefone = regexp_replace(COALESCE(_telefone,''), '\D', '', 'g'),
      nome_whatsapp = COALESCE(_nome, nome_whatsapp),
      conexao_id = COALESCE(_conexao_id, conexao_id),
      conversa_id = COALESCE(_conversa_id, conversa_id),
      tentativas = tentativas + 1
  WHERE id = v.id;

  RETURN QUERY SELECT true, 'ok'::text, v.profile_id, v.finalidade;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.bot_confirmar_verificacao(text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_confirmar_verificacao(text, text, uuid, uuid, text) TO service_role;

-- ============================================================
-- 3. DISPAROS (campanhas)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.bot_disparos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escopo TEXT NOT NULL CHECK (escopo IN ('parceiro', 'coach', 'profissional', 'admin')),
  owner_id UUID,
  nome TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  uso TEXT NOT NULL DEFAULT 'atendimento' CHECK (uso IN ('atendimento', 'plataforma')),
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'enfileirando', 'enviando', 'concluido', 'cancelado')),
  agendado_para TIMESTAMPTZ,
  -- intervalo entre mensagens, em segundos: mandar tudo de uma vez queima o chip
  intervalo_segundos SMALLINT NOT NULL DEFAULT 20 CHECK (intervalo_segundos >= 5),
  iniciado_em TIMESTAMPTZ,
  concluido_em TIMESTAMPTZ,
  criado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.bot_disparos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_disparos TO authenticated;
ALTER TABLE public.bot_disparos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bot_disparos_dono ON public.bot_disparos(escopo, owner_id, status);

CREATE TABLE IF NOT EXISTS public.bot_disparo_alvos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  disparo_id UUID NOT NULL REFERENCES public.bot_disparos(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL,
  nome TEXT,
  cartao_id UUID REFERENCES public.crm_cartoes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enfileirado', 'enviado', 'erro', 'ignorado')),
  mensagem_id UUID REFERENCES public.bot_mensagens(id) ON DELETE SET NULL,
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bot_disparo_alvo_unico UNIQUE (disparo_id, telefone)
);

GRANT ALL ON public.bot_disparo_alvos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_disparo_alvos TO authenticated;
ALTER TABLE public.bot_disparo_alvos ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_bot_disparo_alvos_fila
  ON public.bot_disparo_alvos(disparo_id, status) WHERE status = 'pendente';

DO $do$ BEGIN
  CREATE POLICY "Acesso via dono" ON public.bot_disparos FOR ALL TO authenticated
    USING (public.bot_acesso_dono(escopo, owner_id))
    WITH CHECK (public.bot_acesso_dono(escopo, owner_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DO $do$ BEGIN
  CREATE POLICY "Acesso via disparo" ON public.bot_disparo_alvos FOR ALL TO authenticated
    USING (EXISTS (SELECT 1 FROM public.bot_disparos d
                   WHERE d.id = disparo_id AND public.bot_acesso_dono(d.escopo, d.owner_id)))
    WITH CHECK (EXISTS (SELECT 1 FROM public.bot_disparos d
                        WHERE d.id = disparo_id AND public.bot_acesso_dono(d.escopo, d.owner_id)));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

DROP TRIGGER IF EXISTS trg_bot_disparos_touch ON public.bot_disparos;
CREATE TRIGGER trg_bot_disparos_touch BEFORE UPDATE ON public.bot_disparos
  FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

-- ============================================================
-- 4. CONVERSA VIRA CARTÃO NO FUNIL, SOZINHA
-- ============================================================
-- Quem falou no WhatsApp da academia é um lead. Em vez de alguém digitar isso
-- na mão, a conversa entra no funil na primeira etapa.
--
-- Regras de convivência com o CRM:
--   - só entra em quadro do tipo 'funil', ativo, do mesmo dono da conexão
--   - se já existe cartão com aquele telefone naquele funil, reaproveita em vez
--     de duplicar (a pessoa pode ter vindo de uma importação antes)
--   - se o dono não tem funil, não faz nada e segue a vida

CREATE OR REPLACE FUNCTION public.bot_vincular_cartao(_conversa_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_conv public.bot_conversas%ROWTYPE;
  v_escopo text; v_owner uuid;
  v_quadro uuid; v_coluna uuid; v_cartao uuid; v_pos double precision;
BEGIN
  SELECT * INTO v_conv FROM public.bot_conversas WHERE id = _conversa_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_conv.cartao_id IS NOT NULL THEN RETURN v_conv.cartao_id; END IF;

  SELECT escopo, owner_id INTO v_escopo, v_owner
  FROM public.bot_conexoes WHERE id = v_conv.conexao_id;
  IF v_owner IS NULL THEN RETURN NULL; END IF;

  -- funil ativo mais antigo do dono
  SELECT id INTO v_quadro FROM public.crm_quadros
  WHERE escopo = v_escopo AND owner_id = v_owner
    AND tipo = 'funil' AND arquivado_em IS NULL
  ORDER BY created_at LIMIT 1;
  IF v_quadro IS NULL THEN RETURN NULL; END IF;

  -- já existe cartão com esse telefone neste funil?
  SELECT id INTO v_cartao FROM public.crm_cartoes
  WHERE quadro_id = v_quadro AND contato_telefone = v_conv.telefone
    AND arquivado_em IS NULL
  LIMIT 1;

  IF v_cartao IS NULL THEN
    SELECT id INTO v_coluna FROM public.crm_colunas
    WHERE quadro_id = v_quadro ORDER BY posicao LIMIT 1;
    IF v_coluna IS NULL THEN RETURN NULL; END IF;

    SELECT COALESCE(MAX(posicao), 0) + 1000 INTO v_pos
    FROM public.crm_cartoes WHERE coluna_id = v_coluna;

    INSERT INTO public.crm_cartoes
      (quadro_id, coluna_id, posicao, titulo, contato_nome, contato_telefone, origem)
    VALUES
      (v_quadro, v_coluna, v_pos,
       COALESCE(NULLIF(trim(COALESCE(v_conv.nome,'')), ''), v_conv.telefone),
       v_conv.nome, v_conv.telefone, 'whatsapp')
    RETURNING id INTO v_cartao;

    INSERT INTO public.crm_atividades (cartao_id, tipo, corpo)
    VALUES (v_cartao, 'whatsapp', 'Entrou pelo WhatsApp da academia');
  END IF;

  UPDATE public.bot_conversas SET cartao_id = v_cartao WHERE id = _conversa_id;
  RETURN v_cartao;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.bot_vincular_cartao(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_vincular_cartao(uuid) TO authenticated, service_role;

-- registra no histórico do cartão o que a pessoa disse
CREATE OR REPLACE FUNCTION public.bot_registrar_no_cartao(_conversa_id uuid, _texto text, _direcao text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_cartao uuid;
BEGIN
  SELECT cartao_id INTO v_cartao FROM public.bot_conversas WHERE id = _conversa_id;
  IF v_cartao IS NULL THEN RETURN; END IF;
  INSERT INTO public.crm_atividades (cartao_id, tipo, corpo)
  VALUES (v_cartao, 'whatsapp',
          CASE WHEN _direcao = 'saida' THEN 'Robô: ' ELSE 'Cliente: ' END || left(COALESCE(_texto,''), 500));
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.bot_registrar_no_cartao(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bot_registrar_no_cartao(uuid, text, text) TO authenticated, service_role;
