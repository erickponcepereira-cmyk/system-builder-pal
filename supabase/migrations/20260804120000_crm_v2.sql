-- CRM v2 — separa FUNIL de QUADRO e completa os campos de lead.
--
-- O que muda e por quê:
--
-- 1) FUNIL e QUADRO passam a ser coisas distintas. Eram tratados como a mesma
--    coisa, e não são: no funil o cartão é um LEAD que caminha por etapas até
--    virar aluno; no quadro o cartão é uma TAREFA. Mesma engrenagem, usos e
--    telas diferentes. A coluna `tipo` faz essa separação.
--
-- 2) Cada dono pode ter QUANTOS funis e quadros quiser. O schema já permitia;
--    faltava o `tipo` para a interface saber o que mostrar. Atenção: código que
--    buscava "o quadro do dono" com maybeSingle() quebra agora — foi corrigido
--    em src/lib/admin-crm.functions.ts.
--
-- 3) Campos de lead que faltavam: origem. Sem colunas de dinheiro — valor de
--    negócio, se um dia entrar, passa pelo chat financeiro.
--
-- Não toca em dinheiro. Registrado em docs/REGISTRO-MIGRATIONS.md.
-- Validada em PostgreSQL 16: aplicada duas vezes, com testes de criação,
-- múltiplos funis, importação com deduplicação e isolamento entre parceiros.

-- ============================================================
-- 1. TIPO DO QUADRO
-- ============================================================

ALTER TABLE public.crm_quadros
  ADD COLUMN IF NOT EXISTS tipo TEXT NOT NULL DEFAULT 'funil';

DO $do$ BEGIN
  ALTER TABLE public.crm_quadros
    ADD CONSTRAINT crm_quadros_tipo_valido CHECK (tipo IN ('funil', 'quadro'));
EXCEPTION WHEN duplicate_object THEN NULL; END $do$;

CREATE INDEX IF NOT EXISTS idx_crm_quadros_tipo
  ON public.crm_quadros(escopo, owner_id, tipo);

-- ============================================================
-- 2. CAMPOS DE LEAD NO CARTÃO
-- ============================================================

-- de onde veio o contato: whatsapp, instagram, indicacao, importacao, balcao...
ALTER TABLE public.crm_cartoes
  ADD COLUMN IF NOT EXISTS origem TEXT;

-- para não importar o mesmo telefone duas vezes no mesmo funil
CREATE INDEX IF NOT EXISTS idx_crm_cartoes_telefone
  ON public.crm_cartoes(quadro_id, contato_telefone)
  WHERE contato_telefone IS NOT NULL;

-- ============================================================
-- 3. CRIAR FUNIL/QUADRO COM AS ETAPAS PADRÃO
-- ============================================================
-- Uma função só, para a interface não precisar fazer 2 chamadas e correr o
-- risco de deixar um quadro sem etapa nenhuma se a segunda falhar.

CREATE OR REPLACE FUNCTION public.crm_criar_quadro(
  _escopo text,
  _owner_id uuid,
  _nome text,
  _tipo text DEFAULT 'funil'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_id uuid;
  v_criador uuid;
  v_pode boolean;
  v_etapas text[];
  v_tipos text[];
  i int;
BEGIN
  IF _tipo NOT IN ('funil', 'quadro') THEN
    RAISE EXCEPTION 'Tipo inválido: %', _tipo;
  END IF;

  v_pode := CASE _escopo
    WHEN 'parceiro' THEN public.partner_pode(_owner_id, 'crm')
    WHEN 'coach' THEN EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = _owner_id AND pr.user_id = auth.uid())
    WHEN 'profissional' THEN EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = _owner_id AND pr.user_id = auth.uid())
    WHEN 'admin' THEN COALESCE(public.is_admin(auth.uid()), false)
    ELSE false
  END;
  IF NOT (COALESCE(v_pode, false) OR COALESCE(public.is_admin(auth.uid()), false)) THEN
    RAISE EXCEPTION 'Sem permissão para criar neste destino';
  END IF;

  SELECT pr.id INTO v_criador FROM public.profiles pr WHERE pr.user_id = auth.uid() LIMIT 1;

  INSERT INTO public.crm_quadros (escopo, owner_id, nome, tipo, criado_por)
  VALUES (_escopo, _owner_id, _nome, _tipo, v_criador)
  RETURNING id INTO v_id;

  IF _tipo = 'funil' THEN
    v_etapas := ARRAY['Novo contato','Contato feito','Aula experimental','Negociando','Matriculado','Perdido'];
    v_tipos  := ARRAY['normal','normal','normal','normal','ganho','perdido'];
  ELSE
    v_etapas := ARRAY['A fazer','Fazendo','Feito'];
    v_tipos  := ARRAY['normal','normal','ganho'];
  END IF;

  FOR i IN 1 .. array_length(v_etapas, 1) LOOP
    INSERT INTO public.crm_colunas (quadro_id, nome, posicao, tipo)
    VALUES (v_id, v_etapas[i], i * 1000, v_tipos[i]);
  END LOOP;

  RETURN v_id;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.crm_criar_quadro(text, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_criar_quadro(text, uuid, text, text) TO authenticated, service_role;

-- ============================================================
-- 4. IMPORTAÇÃO DE CONTATOS EM LOTE
-- ============================================================
-- Recebe um JSON com os contatos e cria os cartões na primeira etapa do funil.
-- Ignora telefones que já existem naquele funil, para reimportar a mesma lista
-- não gerar duplicata.
--
-- Formato esperado:
--   [{"nome":"Joana","telefone":"5565999990000","email":"j@x.com"}, ...]

CREATE OR REPLACE FUNCTION public.crm_importar_contatos(
  _quadro_id uuid,
  _contatos jsonb,
  _origem text DEFAULT 'importacao',
  _coluna_id uuid DEFAULT NULL
)
RETURNS TABLE (criados int, ignorados int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_coluna uuid;
  v_pos double precision;
  v_criados int := 0;
  v_ignorados int := 0;
  c jsonb;
  v_tel text;
  v_nome text;
BEGIN
  IF NOT public.crm_acesso_quadro(_quadro_id) THEN
    RAISE EXCEPTION 'Sem acesso a este quadro';
  END IF;

  v_coluna := COALESCE(
    _coluna_id,
    (SELECT id FROM public.crm_colunas WHERE quadro_id = _quadro_id ORDER BY posicao LIMIT 1)
  );
  IF v_coluna IS NULL THEN
    RAISE EXCEPTION 'Este quadro não tem nenhuma etapa. Crie uma antes de importar.';
  END IF;

  SELECT COALESCE(MAX(posicao), 0) INTO v_pos
  FROM public.crm_cartoes WHERE coluna_id = v_coluna;

  FOR c IN SELECT * FROM jsonb_array_elements(_contatos) LOOP
    v_tel := NULLIF(regexp_replace(COALESCE(c->>'telefone',''), '\D', '', 'g'), '');
    v_nome := NULLIF(trim(COALESCE(c->>'nome','')), '');

    IF v_nome IS NULL AND v_tel IS NULL THEN
      v_ignorados := v_ignorados + 1;
      CONTINUE;
    END IF;

    IF v_tel IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.crm_cartoes
      WHERE quadro_id = _quadro_id AND contato_telefone = v_tel AND arquivado_em IS NULL
    ) THEN
      v_ignorados := v_ignorados + 1;
      CONTINUE;
    END IF;

    v_pos := v_pos + 1000;
    INSERT INTO public.crm_cartoes
      (quadro_id, coluna_id, posicao, titulo, contato_nome, contato_telefone, contato_email, origem)
    VALUES
      (_quadro_id, v_coluna, v_pos, COALESCE(v_nome, v_tel), v_nome, v_tel,
       NULLIF(trim(COALESCE(c->>'email','')), ''), _origem);
    v_criados := v_criados + 1;
  END LOOP;

  RETURN QUERY SELECT v_criados, v_ignorados;
END; $fn$;

REVOKE EXECUTE ON FUNCTION public.crm_importar_contatos(uuid, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_importar_contatos(uuid, jsonb, text, uuid) TO authenticated, service_role;
