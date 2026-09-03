-- A recepção passa a enxergar a pessoa, e não só o número dela no leitor.
--
-- O QUE QUEBROU, EM 02/09 ÀS 19:49.
-- A tela de cadastrar rosto buscava a pessoa SÓ na lista do equipamento. Duas
-- consequências, as duas aconteceram na mesma noite:
--
--   1. "Ana Júlia Neponoceno" não apareceu na busca. O único caminho restante
--      era "Pessoa nova", que atribui um número livre na faixa 700001+ — e a
--      referência dela na FitMind é 900012. Teriam virado duas identidades, e
--      a catraca nunca ligaria o rosto dela à mensalidade dela.
--
--   2. Procurando "Juliana", a recepção escolheu "Juliana Rodrigues" (382, do
--      Next Fit) quando queria "Juliana Rodrigues Nascimento" (900011, cliente
--      nova). Um nome é prefixo do outro. A trava do leitor barrou na hora H,
--      mas ela é a última linha de defesa: quem escolhe não tinha como saber
--      que eram duas pessoas, porque a tela mostrava só o nome.
--
-- Nome sozinho não distingue duas pessoas. Telefone, nascimento, plano e
-- última entrada distinguem. É isso que estas funções entregam.
--
-- Todas se autenticam pelo par (agente, segredo), como o resto do agente já
-- faz — o programa da academia não tem sessão de usuário.

-- ---------------------------------------------------------------------------
-- 1. Tirar acento sem depender da extensão `unaccent`.
-- ---------------------------------------------------------------------------
--
-- `unaccent` não está instalada neste banco. Em vez de instalar uma extensão
-- para uma busca de recepção, `translate` resolve com as letras que o
-- português usa — é literal, previsível, e não muda o plano da consulta.
--
-- Vem primeiro porque a busca abaixo a chama: criar na ordem inversa deixa a
-- função existir e quebrar só na primeira consulta de verdade, na recepção.
CREATE OR REPLACE FUNCTION public.sem_acento(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT translate(
    lower(COALESCE(p_texto, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñ',
    'aaaaaeeeeiiiiooooouuuucn'
  );
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Procurar uma pessoa, com o que serve para reconhecê-la.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.academia_agente_pessoas(uuid, text, text);

CREATE FUNCTION public.academia_agente_pessoas(
  p_agente_id uuid,
  p_segredo text,
  p_busca text DEFAULT NULL
)
RETURNS TABLE(
  referencia text,
  nome text,
  telefone text,
  nascimento date,
  ativo boolean,
  no_leitor boolean,
  plano text,
  valido_ate date,
  motivo text,
  entradas integer,
  ultima_entrada date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_partner uuid;
  v_tz text;
  v_termo text;
  v_digitos text;
BEGIN
  SELECT a.partner_id INTO v_partner
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = v_partner;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');

  -- Busca sem acento e sem caso, porque quem digita na recepcao escreve "ana
  -- julia" e o cadastro diz "Ana Júlia". Digito puro casa telefone.
  v_termo   := lower(btrim(COALESCE(p_busca, '')));
  v_digitos := regexp_replace(v_termo, '\D', '', 'g');

  RETURN QUERY
  SELECT cr.referencia,
         COALESCE(NULLIF(btrim(cr.nome_no_equipamento), ''), 'Sem nome')::text,
         cr.telefone,
         cr.nascimento,
         cr.ativo,
         cr.importado_em IS NOT NULL,
         m.plano,
         av.valido_ate,
         av.motivo,
         COALESCE(f.entradas, 0)::integer,
         f.ultima
    FROM public.academia_credenciais cr
    LEFT JOIN LATERAL (
      SELECT me.plano FROM public.academia_mensalidades me
       WHERE me.partner_id = v_partner AND me.status = 'ativa'
         AND me.credencial_id = cr.id
       ORDER BY me.valido_ate DESC LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT a2.valido_ate, a2.motivo
        FROM public.acesso_avaliar_academia(v_partner) a2
       WHERE a2.credencial_id = cr.id LIMIT 1
    ) av ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS entradas,
             max((fr.entrada_em AT TIME ZONE v_tz)::date) AS ultima
        FROM public.academia_frequencias fr
       WHERE fr.partner_id = v_partner AND fr.credencial_id = cr.id
    ) f ON true
   WHERE cr.partner_id = v_partner
     AND (v_termo = ''
       OR public.sem_acento(cr.nome_no_equipamento) LIKE '%' || public.sem_acento(v_termo) || '%'
       OR cr.referencia = v_termo
       OR (v_digitos <> ''
           AND regexp_replace(COALESCE(cr.telefone, ''), '\D', '', 'g') LIKE '%' || v_digitos || '%'))
   ORDER BY cr.ativo DESC, cr.nome_no_equipamento
   LIMIT 40;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_agente_pessoas(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_pessoas(uuid, text, text) TO authenticated, service_role, anon;

-- ---------------------------------------------------------------------------
-- 3. Corrigir o cadastro de quem foi digitado errado.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.academia_agente_credencial_editar(uuid, text, text, text, text, date);

CREATE FUNCTION public.academia_agente_credencial_editar(
  p_agente_id uuid,
  p_segredo text,
  p_referencia text,
  p_nome text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_nascimento date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_partner uuid;
  v_id uuid;
BEGIN
  SELECT a.partner_id INTO v_partner
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT cr.id INTO v_id FROM public.academia_credenciais cr
   WHERE cr.partner_id = v_partner AND cr.referencia = p_referencia;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei essa pessoa nesta academia.');
  END IF;

  -- Campo em branco NAO apaga o que ja existe: a tela manda os tres campos
  -- sempre, e um campo vazio quer dizer "nao mexi nisso", nunca "limpe".
  UPDATE public.academia_credenciais cr
     SET nome_no_equipamento = COALESCE(NULLIF(btrim(p_nome), ''), cr.nome_no_equipamento),
         telefone            = COALESCE(NULLIF(btrim(p_telefone), ''), cr.telefone),
         nascimento          = COALESCE(p_nascimento, cr.nascimento)
   WHERE cr.id = v_id;

  RETURN jsonb_build_object('ok', true, 'referencia', p_referencia);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_agente_credencial_editar(uuid, text, text, text, text, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_credencial_editar(uuid, text, text, text, text, date) TO authenticated, service_role, anon;

-- ---------------------------------------------------------------------------
-- 4. Desligar a duplicada — sem apagar histórico.
-- ---------------------------------------------------------------------------
--
-- `ativo = false`, e não DELETE. As frequências e as mensalidades apontam para
-- a credencial; apagar a linha levaria junto o registro de quem entrou na
-- academia. Desligada, ela para de ser avaliada pela catraca e some das listas,
-- que é o efeito que a recepção quer — e o histórico continua existindo.
--
-- A trava: não desligo quem tem mensalidade ATIVA e válida. Se a duplicada é a
-- que tem o contrato, desligá-la trancaria a pessoa do lado de fora amanhã de
-- manhã. Nesse caso a função recusa e diz qual é o contrato, para a recepção
-- decidir com o dado na frente.
DROP FUNCTION IF EXISTS public.academia_agente_credencial_desligar(uuid, text, text, boolean);

CREATE FUNCTION public.academia_agente_credencial_desligar(
  p_agente_id uuid,
  p_segredo text,
  p_referencia text,
  p_forcar boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_partner uuid;
  cr public.academia_credenciais%ROWTYPE;
  v_mens record;
BEGIN
  SELECT a.partner_id INTO v_partner
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO cr FROM public.academia_credenciais c
   WHERE c.partner_id = v_partner AND c.referencia = p_referencia;
  IF cr.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei essa pessoa nesta academia.');
  END IF;

  IF NOT cr.ativo THEN
    RETURN jsonb_build_object('ok', true, 'ja_estava', true);
  END IF;

  SELECT me.plano, me.valido_ate INTO v_mens
    FROM public.academia_mensalidades me
   WHERE me.partner_id = v_partner AND me.credencial_id = cr.id
     AND me.status = 'ativa' AND me.valido_ate >= current_date
   ORDER BY me.valido_ate DESC LIMIT 1;

  IF v_mens.plano IS NOT NULL AND NOT p_forcar THEN
    RETURN jsonb_build_object(
      'ok', false,
      'precisa_confirmar', true,
      'erro', 'Esta pessoa tem mensalidade ativa (' || v_mens.plano
              || ', vale até ' || to_char(v_mens.valido_ate, 'DD/MM/YYYY')
              || '). Desligar agora tranca ela na porta. Confirme se for mesmo a duplicada.');
  END IF;

  UPDATE public.academia_credenciais SET ativo = false WHERE id = cr.id;

  RETURN jsonb_build_object('ok', true, 'ja_estava', false,
                            'nome', cr.nome_no_equipamento,
                            'tinha_mensalidade', v_mens.plano IS NOT NULL);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_agente_credencial_desligar(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_credencial_desligar(uuid, text, text, boolean) TO authenticated, service_role, anon;

-- ---------------------------------------------------------------------------
-- 5. Quem está sem rosto no equipamento.
-- ---------------------------------------------------------------------------
--
-- O agente é quem sabe: ele lê o equipamento. Esta função só guarda o que ele
-- descobriu, para a lista existir sem 400 chamadas ao leitor a cada abertura
-- de tela.
ALTER TABLE public.academia_credenciais
  ADD COLUMN IF NOT EXISTS rosto_em timestamptz;

COMMENT ON COLUMN public.academia_credenciais.rosto_em IS
  'Quando o agente confirmou que existe rosto gravado no equipamento. Nulo = existe como usuario mas o leitor nao reconhece a pessoa, e a catraca reporta id 0.';

DROP FUNCTION IF EXISTS public.academia_agente_marcar_rostos(uuid, text, jsonb);

CREATE FUNCTION public.academia_agente_marcar_rostos(
  p_agente_id uuid,
  p_segredo text,
  p_com_rosto jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_partner uuid;
  v_refs text[];
  v_n integer;
BEGIN
  SELECT a.partner_id INTO v_partner
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');
  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT array_agg(x) INTO v_refs
    FROM jsonb_array_elements_text(COALESCE(p_com_rosto, '[]'::jsonb)) x;

  IF v_refs IS NULL OR cardinality(v_refs) = 0 THEN
    RETURN jsonb_build_object('ok', true, 'marcados', 0);
  END IF;

  UPDATE public.academia_credenciais
     SET rosto_em = now()
   WHERE partner_id = v_partner AND referencia = ANY(v_refs) AND rosto_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'marcados', v_n);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.academia_agente_marcar_rostos(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_marcar_rostos(uuid, text, jsonb) TO authenticated, service_role, anon;
