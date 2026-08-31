-- Modelo de academia
--
-- Um catalogo de configuracao padrao no admin da plataforma e um aplicador que
-- transforma um parceiro comum em academia ja configurada. Hoje a segunda
-- academia foi montada inteiramente a mao; a terceira dependeria de alguem
-- repetir catraca, planos, avisos e turmas item por item.
--
-- Auditoria feita ANTES de criar (o risco deste banco e duplicacao):
--   * information_schema: nao existe tabela de preset/template de parceiro.
--     `academia_avisos_modelos` e a tabela de textos de aviso DE UMA academia
--     (tem partner_id), e `workout_templates` e de treino. Nenhuma serve.
--   * pg_proc: o unico semeador existente e `academia_avisos_semear(partner)`,
--     que grava 8 avisos fixos e so quando o parceiro nao tem nenhum. Ele
--     resolve outro problema (rede de seguranca da tela do parceiro) e fica
--     intacto; o texto padrao dele, `academia_aviso_texto_padrao(marco)`, e
--     reaproveitado aqui como fallback de aviso sem texto.
--   * guarda de admin: `is_admin(auth.uid())` e o mecanismo do projeto
--     (121 policies usam exatamente isso). Nao foi criada guarda nova.
--
-- O conteudo do modelo e jsonb com UMA SECAO POR ASSUNTO. O aplicador itera a
-- lista de secoes que conhece e ignora em silencio o que nao conhece: quando
-- `caixa` ou `turma_alunos` existirem, entram como mais um item da lista, sem
-- reescrever nada.

-- ---------------------------------------------------------------------------
-- 1. Catalogo
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.academia_modelos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  descricao  text,
  conteudo   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_modelo_nome_unico UNIQUE (nome),
  CONSTRAINT academia_modelo_conteudo_objeto CHECK (jsonb_typeof(conteudo) = 'object')
);

COMMENT ON TABLE public.academia_modelos IS
  'Catalogo da plataforma: conjunto padrao de configuracao de academia. Sem partner_id de proposito — e da plataforma, nao de um parceiro.';
COMMENT ON COLUMN public.academia_modelos.conteudo IS
  'Uma secao por assunto: config, planos, avisos, turmas. Secao desconhecida pelo aplicador e ignorada em silencio.';

DROP TRIGGER IF EXISTS academia_modelos_updated_at ON public.academia_modelos;
CREATE TRIGGER academia_modelos_updated_at
  BEFORE UPDATE ON public.academia_modelos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.academia_modelos ENABLE ROW LEVEL SECURITY;

-- `TO authenticated` explicito. Sem TO a policy vale para PUBLIC, que inclui
-- anon — foi assim que 413 credenciais vazaram em 28/08.
-- A checagem chama is_admin(), nunca `profiles` direto de dentro da policy.
DROP POLICY IF EXISTS academia_modelos_admin ON public.academia_modelos;
CREATE POLICY academia_modelos_admin ON public.academia_modelos
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

REVOKE ALL ON public.academia_modelos FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academia_modelos TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Guarda
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.academia_modelo_pode_gerir()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  -- auth.uid() nulo e service_role: quem chamou (o server function do admin)
  -- ja conferiu o perfil. Mesma convencao de academia_pode_ver().
  -- Sessao de usuario precisa ser admin da plataforma.
  SELECT auth.uid() IS NULL OR public.is_admin(auth.uid());
$fn$;

-- ---------------------------------------------------------------------------
-- 3. Extrair o modelo de uma academia que ja funciona
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.academia_modelo_do_partner(p_partner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_nome  text;
  v_marca text;
BEGIN
  IF NOT public.academia_modelo_pode_gerir() THEN
    RAISE EXCEPTION 'Modelo de academia e do admin da plataforma.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT p.fantasy_name INTO v_nome FROM public.partners p WHERE p.id = p_partner_id;
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Parceiro % nao existe.', p_partner_id USING ERRCODE = 'no_data_found';
  END IF;

  -- O nome da academia de origem sai dos textos de aviso e vira {academia},
  -- que o aplicador troca pelo nome do parceiro de destino. Sem isso a
  -- academia nova mandaria WhatsApp assinado com o nome da academia velha.
  -- \m e \M: so a palavra inteira. Sem eles uma academia chamada "Fit"
  -- transformaria "Fitness" em "{academia}ness" no meio da frase.
  v_marca := '\m' || regexp_replace(v_nome, '(\W)', '\\\1', 'g') || '\M';

  RETURN jsonb_build_object(
    'versao', 1,
    'origem', jsonb_build_object(
      'partner_id', p_partner_id,
      'nome', v_nome,
      'extraido_em', now()
    ),
    -- grupo_id fica de fora de proposito: e o vinculo desta academia com a
    -- rede dela, nao um padrao de configuracao. Copiar jogaria a academia
    -- nova para dentro do grupo da academia de origem.
    'config', (
      SELECT to_jsonb(c) - 'id' - 'partner_id' - 'grupo_id' - 'created_at' - 'updated_at'
        FROM public.partner_acesso_config c
       WHERE c.partner_id = p_partner_id
    ),
    'planos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'nome', pl.nome,
               'valor_padrao', pl.valor_padrao,
               'dias', pl.dias,
               'posicao', pl.posicao,
               'ativo', pl.ativo,
               'limite_dias_semana', pl.limite_dias_semana,
               'apelidos', to_jsonb(pl.apelidos)
             ) ORDER BY pl.posicao, pl.nome)
        FROM public.academia_planos pl
       WHERE pl.partner_id = p_partner_id
    ), '[]'::jsonb),
    'avisos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'marco', a.marco,
               'nome', a.nome,
               'referencia', a.referencia,
               'quando', a.quando,
               'posicao', a.posicao,
               'ativo', a.ativo,
               'texto', regexp_replace(a.texto, v_marca, '{academia}', 'gi')
             ) ORDER BY a.posicao, a.marco)
        FROM public.academia_avisos_modelos a
       WHERE a.partner_id = p_partner_id
    ), '[]'::jsonb),
    'turmas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'nome', t.nome,
               'modalidade', t.modalidade,
               'dias_semana', to_jsonb(t.dias_semana),
               'hora_inicio', t.hora_inicio::text,
               'hora_fim', t.hora_fim::text,
               'ativo', t.ativo
             ) ORDER BY t.hora_inicio NULLS LAST, t.nome)
        FROM public.academia_turmas t
       WHERE t.partner_id = p_partner_id
    ), '[]'::jsonb)
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. Secoes do aplicador — uma funcao por assunto
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.academia_modelo_resumo(p_itens jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'resumo', COALESCE((
      SELECT jsonb_object_agg(s.acao, s.n)
        FROM (SELECT i->>'acao' AS acao, count(*) AS n
                FROM jsonb_array_elements(p_itens) i
               GROUP BY 1) s
    ), '{}'::jsonb),
    'itens', p_itens
  );
$fn$;

CREATE OR REPLACE FUNCTION public.academia_modelo_secao_config(
  p_partner_id uuid, p_secao jsonb, p_sobrescrever boolean, p_simular boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_existe boolean := EXISTS (
    SELECT 1 FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id);
  v_acao text;
BEGIN
  IF p_secao IS NULL OR jsonb_typeof(p_secao) <> 'object' THEN
    RETURN public.academia_modelo_resumo(jsonb_build_array(jsonb_build_object(
      'item', 'configuracao de acesso', 'acao', 'ignorado',
      'motivo', 'o modelo nao traz a secao config')));
  END IF;

  IF v_existe AND NOT p_sobrescrever THEN
    RETURN public.academia_modelo_resumo(jsonb_build_array(jsonb_build_object(
      'item', 'configuracao de acesso', 'acao', 'pulado',
      'motivo', 'o parceiro ja tem configuracao de acesso')));
  END IF;

  v_acao := CASE WHEN v_existe THEN 'atualizado' ELSE 'criado' END;

  IF NOT p_simular THEN
    IF NOT v_existe THEN
      INSERT INTO public.partner_acesso_config (partner_id) VALUES (p_partner_id);
    END IF;

    -- `p_secao ? 'coluna'` em vez de COALESCE: chave ausente preserva o que
    -- esta la, chave com null grava null. Coluna nova da tabela entra aqui
    -- como uma linha a mais; ate la ela e simplesmente preservada.
    UPDATE public.partner_acesso_config SET
      dias_carencia = CASE WHEN p_secao ? 'dias_carencia'
        THEN (p_secao->>'dias_carencia')::integer ELSE dias_carencia END,
      exige_senha_liberacao = CASE WHEN p_secao ? 'exige_senha_liberacao'
        THEN (p_secao->>'exige_senha_liberacao')::boolean ELSE exige_senha_liberacao END,
      regra_dayuse = CASE WHEN p_secao ? 'regra_dayuse'
        THEN p_secao->>'regra_dayuse' ELSE regra_dayuse END,
      timezone = CASE WHEN p_secao ? 'timezone'
        THEN p_secao->>'timezone' ELSE timezone END,
      modelo_catraca = CASE WHEN p_secao ? 'modelo_catraca'
        THEN p_secao->>'modelo_catraca' ELSE modelo_catraca END,
      avisos_automaticos = CASE WHEN p_secao ? 'avisos_automaticos'
        THEN (p_secao->>'avisos_automaticos')::boolean ELSE avisos_automaticos END,
      validacao_frequencia = CASE WHEN p_secao ? 'validacao_frequencia'
        THEN p_secao->>'validacao_frequencia' ELSE validacao_frequencia END,
      frequencia_conta = CASE WHEN p_secao ? 'frequencia_conta'
        THEN p_secao->>'frequencia_conta' ELSE frequencia_conta END,
      frequencia_periodo = CASE WHEN p_secao ? 'frequencia_periodo'
        THEN p_secao->>'frequencia_periodo' ELSE frequencia_periodo END,
      frequencia_meta = CASE WHEN p_secao ? 'frequencia_meta'
        THEN (p_secao->>'frequencia_meta')::integer ELSE frequencia_meta END,
      avisos_hora = CASE WHEN p_secao ? 'avisos_hora'
        THEN (p_secao->>'avisos_hora')::smallint ELSE avisos_hora END,
      avisos_dias = CASE WHEN jsonb_typeof(p_secao->'avisos_dias') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_secao->'avisos_dias'))::smallint[]
        ELSE avisos_dias END,
      avisos_envio_automatico = CASE WHEN p_secao ? 'avisos_envio_automatico'
        THEN (p_secao->>'avisos_envio_automatico')::boolean ELSE avisos_envio_automatico END,
      dias_sumido = CASE WHEN p_secao ? 'dias_sumido'
        THEN (p_secao->>'dias_sumido')::smallint ELSE dias_sumido END,
      tolerancia_aula_min = CASE WHEN p_secao ? 'tolerancia_aula_min'
        THEN (p_secao->>'tolerancia_aula_min')::smallint ELSE tolerancia_aula_min END,
      updated_at = now()
    WHERE partner_id = p_partner_id;
  END IF;

  RETURN public.academia_modelo_resumo(jsonb_build_array(jsonb_build_object(
    'item', 'configuracao de acesso', 'acao', v_acao)));
END;
$fn$;

CREATE OR REPLACE FUNCTION public.academia_modelo_secao_planos(
  p_partner_id uuid, p_secao jsonb, p_sobrescrever boolean, p_simular boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_item     jsonb;
  v_nome     text;
  v_apelidos text[];
  v_id       uuid;
  v_nomes    text[] := '{}';
  v_itens    jsonb  := '[]'::jsonb;
  v_uso      integer;
  r          RECORD;
BEGIN
  IF p_secao IS NULL OR jsonb_typeof(p_secao) <> 'array' THEN
    RETURN public.academia_modelo_resumo(jsonb_build_array(jsonb_build_object(
      'item', 'planos', 'acao', 'ignorado', 'motivo', 'o modelo nao traz a secao planos')));
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_secao) LOOP
    v_nome := btrim(COALESCE(v_item->>'nome', ''));

    IF v_nome = '' THEN
      v_itens := v_itens || jsonb_build_object(
        'item', null, 'acao', 'ignorado', 'motivo', 'plano sem nome no modelo');
      CONTINUE;
    END IF;

    v_nomes := v_nomes || lower(v_nome);
    v_apelidos := CASE WHEN jsonb_typeof(v_item->'apelidos') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'apelidos'))
      ELSE '{}'::text[] END;

    SELECT pl.id INTO v_id FROM public.academia_planos pl
     WHERE pl.partner_id = p_partner_id AND lower(btrim(pl.nome)) = lower(v_nome);

    IF v_id IS NULL THEN
      IF NOT p_simular THEN
        INSERT INTO public.academia_planos
          (partner_id, nome, valor_padrao, dias, posicao, ativo, limite_dias_semana, apelidos)
        VALUES (p_partner_id, v_nome,
                COALESCE((v_item->>'valor_padrao')::numeric, 0),
                COALESCE((v_item->>'dias')::integer, 30),
                COALESCE((v_item->>'posicao')::integer, 0),
                COALESCE((v_item->>'ativo')::boolean, true),
                (v_item->>'limite_dias_semana')::integer,
                v_apelidos);
      END IF;
      v_itens := v_itens || jsonb_build_object('item', v_nome, 'acao', 'criado');

    ELSIF NOT p_sobrescrever THEN
      v_itens := v_itens || jsonb_build_object(
        'item', v_nome, 'acao', 'pulado', 'motivo', 'ja existe neste parceiro');

    ELSE
      IF NOT p_simular THEN
        UPDATE public.academia_planos SET
          valor_padrao = COALESCE((v_item->>'valor_padrao')::numeric, valor_padrao),
          dias = COALESCE((v_item->>'dias')::integer, dias),
          posicao = COALESCE((v_item->>'posicao')::integer, posicao),
          ativo = COALESCE((v_item->>'ativo')::boolean, ativo),
          limite_dias_semana = CASE WHEN v_item ? 'limite_dias_semana'
            THEN (v_item->>'limite_dias_semana')::integer ELSE limite_dias_semana END,
          apelidos = v_apelidos,
          updated_at = now()
        WHERE id = v_id;
      END IF;
      v_itens := v_itens || jsonb_build_object('item', v_nome, 'acao', 'atualizado');
    END IF;
  END LOOP;

  -- Poda: so com p_sobrescrever, e nunca em cima de plano que alguem vendeu.
  -- A mensalidade guarda o plano como TEXTO (academia_mensalidades.plano),
  -- entao a regra de casamento e a mesma de academia_plano_do_texto(): nome
  -- ou apelido. Plano em uso e reportado, nao apagado.
  IF p_sobrescrever THEN
    FOR r IN
      SELECT pl.id, pl.nome, pl.apelidos FROM public.academia_planos pl
       WHERE pl.partner_id = p_partner_id
         AND lower(btrim(pl.nome)) <> ALL (v_nomes)
    LOOP
      SELECT count(*) INTO v_uso FROM public.academia_mensalidades m
       WHERE m.partner_id = p_partner_id
         AND (lower(btrim(m.plano)) = lower(btrim(r.nome))
              OR EXISTS (SELECT 1 FROM unnest(r.apelidos) a
                          WHERE lower(btrim(a)) = lower(btrim(m.plano))));

      IF v_uso > 0 THEN
        v_itens := v_itens || jsonb_build_object(
          'item', r.nome, 'acao', 'protegido',
          'motivo', v_uso || ' mensalidade(s) apontam para este plano');
      ELSE
        IF NOT p_simular THEN
          DELETE FROM public.academia_planos WHERE id = r.id;
        END IF;
        v_itens := v_itens || jsonb_build_object(
          'item', r.nome, 'acao', 'removido', 'motivo', 'fora do modelo e sem mensalidade');
      END IF;
    END LOOP;
  END IF;

  RETURN public.academia_modelo_resumo(v_itens);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.academia_modelo_secao_avisos(
  p_partner_id uuid, p_secao jsonb, p_sobrescrever boolean, p_simular boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_item     jsonb;
  v_marco    text;
  v_texto    text;
  v_academia text;
  v_id       uuid;
  v_itens    jsonb := '[]'::jsonb;
BEGIN
  IF p_secao IS NULL OR jsonb_typeof(p_secao) <> 'array' THEN
    RETURN public.academia_modelo_resumo(jsonb_build_array(jsonb_build_object(
      'item', 'avisos', 'acao', 'ignorado', 'motivo', 'o modelo nao traz a secao avisos')));
  END IF;

  SELECT p.fantasy_name INTO v_academia FROM public.partners p WHERE p.id = p_partner_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_secao) LOOP
    v_marco := btrim(COALESCE(v_item->>'marco', ''));

    IF v_marco = '' THEN
      v_itens := v_itens || jsonb_build_object(
        'item', null, 'acao', 'ignorado', 'motivo', 'aviso sem marco no modelo');
      CONTINUE;
    END IF;

    -- {academia} vira o nome do parceiro de destino aqui, na gravacao.
    -- academia_avisos_preparar so resolve {nome} e {data}, entao o texto
    -- gravado nunca pode sair daqui com {academia} dentro.
    -- Texto vazio cai no padrao que ja existe no banco.
    v_texto := replace(COALESCE(v_item->>'texto', ''), '{academia}', COALESCE(v_academia, ''));
    v_texto := COALESCE(NULLIF(btrim(v_texto), ''), public.academia_aviso_texto_padrao(v_marco));

    SELECT a.id INTO v_id FROM public.academia_avisos_modelos a
     WHERE a.partner_id = p_partner_id AND a.marco = v_marco;

    IF v_id IS NULL THEN
      IF NOT p_simular THEN
        INSERT INTO public.academia_avisos_modelos
          (partner_id, marco, nome, referencia, quando, posicao, texto, ativo)
        VALUES (p_partner_id, v_marco,
                NULLIF(btrim(COALESCE(v_item->>'nome', '')), ''),
                COALESCE(v_item->>'referencia', 'vencimento'),
                COALESCE((v_item->>'quando')::integer, 0),
                COALESCE((v_item->>'posicao')::integer, 0),
                v_texto,
                COALESCE((v_item->>'ativo')::boolean, true));
      END IF;
      v_itens := v_itens || jsonb_build_object('item', v_marco, 'acao', 'criado');

    ELSIF NOT p_sobrescrever THEN
      v_itens := v_itens || jsonb_build_object(
        'item', v_marco, 'acao', 'pulado', 'motivo', 'ja existe neste parceiro');

    ELSE
      IF NOT p_simular THEN
        UPDATE public.academia_avisos_modelos SET
          nome = COALESCE(NULLIF(btrim(COALESCE(v_item->>'nome', '')), ''), nome),
          referencia = COALESCE(v_item->>'referencia', referencia),
          quando = COALESCE((v_item->>'quando')::integer, quando),
          posicao = COALESCE((v_item->>'posicao')::integer, posicao),
          ativo = COALESCE((v_item->>'ativo')::boolean, ativo),
          texto = v_texto,
          updated_at = now()
        WHERE id = v_id;
      END IF;
      v_itens := v_itens || jsonb_build_object('item', v_marco, 'acao', 'atualizado');
    END IF;
  END LOOP;

  -- Sem poda de propria vontade: aviso que a academia escreveu e texto dela.
  -- Apagar seria perda pura, e nao ha "aviso sobrando" que atrapalhe.
  RETURN public.academia_modelo_resumo(v_itens);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.academia_modelo_secao_turmas(
  p_partner_id uuid, p_secao jsonb, p_sobrescrever boolean, p_simular boolean)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $fn$
DECLARE
  v_item  jsonb;
  v_nome  text;
  v_dias  smallint[];
  v_id    uuid;
  v_itens jsonb := '[]'::jsonb;
BEGIN
  IF p_secao IS NULL OR jsonb_typeof(p_secao) <> 'array' THEN
    RETURN public.academia_modelo_resumo(jsonb_build_array(jsonb_build_object(
      'item', 'turmas', 'acao', 'ignorado', 'motivo', 'o modelo nao traz a secao turmas')));
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_secao) LOOP
    v_nome := btrim(COALESCE(v_item->>'nome', ''));

    IF v_nome = '' THEN
      v_itens := v_itens || jsonb_build_object(
        'item', null, 'acao', 'ignorado', 'motivo', 'turma sem nome no modelo');
      CONTINUE;
    END IF;

    v_dias := CASE WHEN jsonb_typeof(v_item->'dias_semana') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(v_item->'dias_semana'))::smallint[]
      ELSE '{}'::smallint[] END;

    -- academia_turmas nao tem unicidade de nome no banco; a chave aqui e o
    -- nome normalizado, para que aplicar duas vezes nao crie a turma de novo.
    SELECT t.id INTO v_id FROM public.academia_turmas t
     WHERE t.partner_id = p_partner_id AND lower(btrim(t.nome)) = lower(v_nome)
     ORDER BY t.created_at LIMIT 1;

    IF v_id IS NULL THEN
      IF NOT p_simular THEN
        INSERT INTO public.academia_turmas
          (partner_id, nome, modalidade, dias_semana, hora_inicio, hora_fim, ativo)
        VALUES (p_partner_id, v_nome,
                NULLIF(btrim(COALESCE(v_item->>'modalidade', '')), ''),
                v_dias,
                NULLIF(v_item->>'hora_inicio', '')::time,
                NULLIF(v_item->>'hora_fim', '')::time,
                COALESCE((v_item->>'ativo')::boolean, true));
      END IF;
      v_itens := v_itens || jsonb_build_object('item', v_nome, 'acao', 'criado');

    ELSIF NOT p_sobrescrever THEN
      v_itens := v_itens || jsonb_build_object(
        'item', v_nome, 'acao', 'pulado', 'motivo', 'ja existe neste parceiro');

    ELSE
      IF NOT p_simular THEN
        UPDATE public.academia_turmas SET
          modalidade = COALESCE(NULLIF(btrim(COALESCE(v_item->>'modalidade', '')), ''), modalidade),
          dias_semana = CASE WHEN jsonb_typeof(v_item->'dias_semana') = 'array'
            THEN v_dias ELSE dias_semana END,
          hora_inicio = COALESCE(NULLIF(v_item->>'hora_inicio', '')::time, hora_inicio),
          hora_fim = COALESCE(NULLIF(v_item->>'hora_fim', '')::time, hora_fim),
          ativo = COALESCE((v_item->>'ativo')::boolean, ativo)
        WHERE id = v_id;
      END IF;
      v_itens := v_itens || jsonb_build_object('item', v_nome, 'acao', 'atualizado');
    END IF;
  END LOOP;

  -- Sem poda: academia_frequencias aponta para academia_turmas. Apagar turma
  -- desliga a frequencia historica dela (ON DELETE SET NULL).
  RETURN public.academia_modelo_resumo(v_itens);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Aplicador
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.academia_modelo_aplicar(
  p_partner_id uuid,
  p_modelo_id uuid,
  p_sobrescrever boolean DEFAULT false,
  p_simular boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  -- Uma linha por assunto. Quando `caixa` ou `turma_alunos` existirem, entram
  -- aqui e no CASE abaixo: e um item a mais, nao uma reescrita.
  c_secoes constant text[] := ARRAY['config', 'planos', 'avisos', 'turmas'];
  v_conteudo jsonb;
  v_modelo   text;
  v_parceiro text;
  v_relato   jsonb := '{}'::jsonb;
  v_secao    text;
BEGIN
  IF NOT public.academia_modelo_pode_gerir() THEN
    RAISE EXCEPTION 'Aplicar modelo de academia e do admin da plataforma.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT m.nome, m.conteudo INTO v_modelo, v_conteudo
    FROM public.academia_modelos m WHERE m.id = p_modelo_id AND m.ativo;
  IF v_modelo IS NULL THEN
    RAISE EXCEPTION 'Modelo % nao existe ou esta desativado.', p_modelo_id
      USING ERRCODE = 'no_data_found';
  END IF;

  SELECT p.fantasy_name INTO v_parceiro FROM public.partners p WHERE p.id = p_partner_id;
  IF v_parceiro IS NULL THEN
    RAISE EXCEPTION 'Parceiro % nao existe.', p_partner_id USING ERRCODE = 'no_data_found';
  END IF;

  FOREACH v_secao IN ARRAY c_secoes LOOP
    v_relato := v_relato || jsonb_build_object(v_secao, CASE v_secao
      WHEN 'config' THEN public.academia_modelo_secao_config(
        p_partner_id, v_conteudo->'config', p_sobrescrever, p_simular)
      WHEN 'planos' THEN public.academia_modelo_secao_planos(
        p_partner_id, v_conteudo->'planos', p_sobrescrever, p_simular)
      WHEN 'avisos' THEN public.academia_modelo_secao_avisos(
        p_partner_id, v_conteudo->'avisos', p_sobrescrever, p_simular)
      WHEN 'turmas' THEN public.academia_modelo_secao_turmas(
        p_partner_id, v_conteudo->'turmas', p_sobrescrever, p_simular)
    END);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'simulado', p_simular,
    'sobrescrever', p_sobrescrever,
    'partner_id', p_partner_id,
    'parceiro', v_parceiro,
    'modelo_id', p_modelo_id,
    'modelo', v_modelo,
    'quando', now(),
    -- Secao que este aplicador ainda nao conhece passa batido de proposito:
    -- o conteudo pode ganhar blocos antes de existir codigo para eles aqui.
    'secoes_ignoradas', COALESCE((
      SELECT jsonb_agg(k) FROM jsonb_object_keys(v_conteudo) k
       WHERE k <> ALL (c_secoes) AND k NOT IN ('versao', 'origem')
    ), '[]'::jsonb),
    'secoes', v_relato
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. Quem pode executar
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.academia_modelo_pode_gerir() FROM public, anon;
REVOKE ALL ON FUNCTION public.academia_modelo_do_partner(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.academia_modelo_aplicar(uuid, uuid, boolean, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.academia_modelo_pode_gerir() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_modelo_do_partner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_modelo_aplicar(uuid, uuid, boolean, boolean) TO authenticated, service_role;

-- As secoes so existem para o aplicador chamar. Ele e SECURITY DEFINER do
-- postgres, entao roda com privilegio proprio e nao precisa destes grants.
REVOKE ALL ON FUNCTION public.academia_modelo_secao_config(uuid, jsonb, boolean, boolean) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.academia_modelo_secao_planos(uuid, jsonb, boolean, boolean) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.academia_modelo_secao_avisos(uuid, jsonb, boolean, boolean) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.academia_modelo_secao_turmas(uuid, jsonb, boolean, boolean) FROM public, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.academia_modelo_resumo(jsonb) FROM public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Primeiro modelo: nasce da academia que ja funciona
-- ---------------------------------------------------------------------------

INSERT INTO public.academia_modelos (nome, descricao, conteudo)
SELECT 'Academia padrao (Estacao)',
       'Extraido da Estacao Treinamento Funcional, que roda em producao: catraca, 6 planos, 8 avisos e 6 turmas. Os avisos ja vem com o envio automatico LIGADO, como na Estacao — revise antes de aplicar numa academia sem numero de WhatsApp conectado.',
       public.academia_modelo_do_partner('646c99dd-23cc-4da5-ba96-e52cfb1384b4'::uuid)
 WHERE NOT EXISTS (SELECT 1 FROM public.academia_modelos WHERE nome = 'Academia padrao (Estacao)');

-- A Estacao assina os avisos com o nome por extenso, que nao e o fantasy_name
-- dela — o \m..\M do extrator nao tinha como casar. Troca feita aqui, uma vez,
-- para o modelo semeado sair generico de verdade.
UPDATE public.academia_modelos m SET conteudo = jsonb_set(m.conteudo, '{avisos}', (
  SELECT COALESCE(jsonb_agg(
           a || jsonb_build_object('texto',
             regexp_replace(a->>'texto', 'ESTA(C|Ç)(A|Ã)O TREINAMENTO FUNCIONAL', '{academia}', 'gi'))
           ORDER BY t.ord), '[]'::jsonb)
    FROM jsonb_array_elements(m.conteudo->'avisos') WITH ORDINALITY AS t(a, ord)))
 WHERE m.nome = 'Academia padrao (Estacao)'
   AND m.conteudo->'avisos' @> '[]'::jsonb;
