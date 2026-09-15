-- O grupo passa a valer para o agente da catraca inteiro, e as alunas da Jessica
-- saem da Estacao.
--
-- A migration 20260827140000 disse que o agente olhava o grupo. So o retrato
-- olhava. `academia_agente_enviar` -- a que grava cada passagem -- e o resto do
-- agente procuravam a pessoa apenas na academia DONA do equipamento. Com a
-- primeira aluna transferida para a Jessica isso viraria tres defeitos:
--
--   1. o leitor liberava (o retrato olha o grupo), mas a passagem nao achava a
--      credencial na Estacao e era gravada como BARRADA na Estacao -- e nenhuma
--      frequencia na Jessica, entao o limite semanal parava de contar;
--   2. a leitura seguinte do equipamento (credenciais_importar) nao achava a
--      referencia na Estacao e recriava a pessoa la: duplicata;
--   3. aluna nova cadastrada no painel da Jessica nunca chegava ao leitor
--      (credenciais_pendentes, faces_a_enviar so olhavam a Estacao).
--
-- Regra desta migration, igual a do retrato: o EQUIPAMENTO e do grupo; a
-- PESSOA e de uma academia so, e tudo que ela gera vai para a academia dela.
-- Rosto desconhecido, que nao tem dona, fica com a academia do equipamento.
--
-- Nenhuma assinatura muda: o agente no PC da academia chama estas funcoes pela
-- chave anonima e nao pode perceber a troca.

-- ------------------------------------------------------------------ auxiliar

/**
 * A credencial desta referencia em qualquer academia do grupo.
 *
 * O leitor tem uma lista so, entao a referencia deveria ser unica no grupo. Se
 * houver duplicata (erro de cadastro), vale a mesma regra do retrato: a ativa,
 * com a mensalidade que vence por ultimo; empate fica com a dona do equipamento.
 */
CREATE OR REPLACE FUNCTION public.academia_credencial_no_grupo(p_partner_id uuid, p_referencia text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT cr.id
    FROM public.academia_credenciais cr
   WHERE cr.partner_id IN (SELECT g.partner_id FROM public.academia_parceiros_do_grupo(p_partner_id) g)
     AND cr.referencia = p_referencia
   ORDER BY cr.ativo DESC,
            (SELECT max(m.valido_ate) FROM public.academia_mensalidades m
              WHERE m.partner_id = cr.partner_id AND m.status = 'ativa' AND m.credencial_id = cr.id) DESC NULLS LAST,
            (cr.partner_id = p_partner_id) DESC
   LIMIT 1
$function$;

-- So as funcoes do agente (SECURITY DEFINER) usam. De fora, devolveria o id
-- da credencial de qualquer academia a partir de um numero.
REVOKE ALL ON FUNCTION public.academia_credencial_no_grupo(uuid, text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ agente

CREATE OR REPLACE FUNCTION public.academia_agente_enviar(p_agente_id uuid, p_segredo text, p_eventos jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a RECORD; e jsonb; cr RECORD; v_em timestamptz; v_total integer := 0;
BEGIN
  SELECT id, partner_id INTO a FROM public.academia_agentes
   WHERE id = p_agente_id AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.academia_agentes SET ultimo_contato_em = now() WHERE id = a.id;

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_eventos, '[]'::jsonb))
  LOOP
    -- A pessoa pode ser de qualquer academia que divide este leitor, e a
    -- passagem vai para a academia DELA: aluna da Jessica passando no leitor
    -- da Estacao conta frequencia na Jessica, e nao vira barrada na Estacao.
    SELECT c.id, c.partner_id, c.student_id INTO cr
      FROM public.academia_credenciais c
     WHERE c.id = public.academia_credencial_no_grupo(a.partner_id, e->>'ref');
    v_em := COALESCE((e->>'em')::timestamptz, now());

    IF COALESCE(e->>'resultado', '') = 'liberado' AND cr.id IS NOT NULL THEN
      INSERT INTO public.academia_frequencias (partner_id, student_id, credencial_id, origem, entrada_em)
      SELECT cr.partner_id, cr.student_id, cr.id, COALESCE(e->>'origem', 'catraca'), v_em
       WHERE NOT EXISTS (
         SELECT 1 FROM public.academia_frequencias f
          WHERE f.partner_id = cr.partner_id AND f.credencial_id = cr.id AND f.entrada_em = v_em
       );
    ELSE
      -- Rosto desconhecido nao tem dona: fica com a academia do equipamento.
      INSERT INTO public.academia_acessos_negados
        (partner_id, student_id, referencia, motivo, origem, tentado_em, detalhe)
      VALUES (COALESCE(cr.partner_id, a.partner_id), cr.student_id, e->>'ref',
              COALESCE(e->>'motivo', 'desconhecido'), COALESCE(e->>'origem', 'catraca'), v_em,
              -- Vem do agente. Corta em 300 para uma pilha de erro longa nao
              -- virar linha gigante no banco.
              left(NULLIF(btrim(COALESCE(e->>'detalhe','')), ''), 300));
    END IF;
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_agente_credenciais_importar(p_agente_id uuid, p_segredo text, p_usuarios jsonb)
 RETURNS TABLE(novas integer, atualizadas integer, total integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agente uuid;
  v_partner uuid;
  u jsonb;
  v_novas integer := 0;
  v_atu integer := 0;
  v_total integer := 0;
  v_existente uuid;
BEGIN
  SELECT a.id, a.partner_id
    INTO v_agente, v_partner
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id
     AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF v_agente IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes a SET ultimo_contato_em = now() WHERE a.id = v_agente;

  FOR u IN SELECT * FROM jsonb_array_elements(COALESCE(p_usuarios, '[]'::jsonb))
  LOOP
    CONTINUE WHEN COALESCE(u->>'id', '') = '';
    v_total := v_total + 1;

    -- O leitor e um so para o grupo. Quem ja existe em QUALQUER academia do
    -- grupo e a mesma pessoa: sem isto, aluna transferida para a Jessica
    -- voltava a nascer na Estacao na leitura seguinte do equipamento.
    SELECT c.id INTO v_existente
      FROM public.academia_credenciais c
     WHERE c.partner_id IN (SELECT g.partner_id FROM public.academia_parceiros_do_grupo(v_partner) g)
       AND c.tipo = 'facial' AND c.referencia = (u->>'id')
     ORDER BY (c.partner_id = v_partner) DESC
     LIMIT 1;

    IF v_existente IS NOT NULL THEN
      -- so atualiza o nome vindo do equipamento; NUNCA mexe no vinculo que
      -- alguem ja fez a mao
      UPDATE public.academia_credenciais c
         SET nome_no_equipamento = COALESCE(NULLIF(trim(COALESCE(u->>'name','')), ''), c.nome_no_equipamento),
             importado_em = now()
       WHERE c.id = v_existente;
      v_atu := v_atu + 1;
    ELSE
      INSERT INTO public.academia_credenciais
        (partner_id, tipo, referencia, nome_no_equipamento, importado_em, ativo)
      VALUES
        (v_partner, 'facial', u->>'id', NULLIF(trim(COALESCE(u->>'name','')), ''), now(), true)
      ON CONFLICT ON CONSTRAINT academia_credencial_unica DO UPDATE
        SET nome_no_equipamento = COALESCE(EXCLUDED.nome_no_equipamento,
                                           public.academia_credenciais.nome_no_equipamento),
            importado_em = now();
      v_novas := v_novas + 1;
    END IF;
  END LOOP;

  novas := v_novas; atualizadas := v_atu; total := v_total;
  RETURN NEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_agente_credenciais_pendentes(p_agente_id uuid, p_segredo text)
 RETURNS TABLE(referencia text, nome text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE a RECORD;
BEGIN
  SELECT id, partner_id INTO a
    FROM public.academia_agentes
   WHERE id = p_agente_id
     AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes SET ultimo_contato_em = now() WHERE id = a.id;

  RETURN QUERY
  SELECT cr.referencia,
         COALESCE(NULLIF(btrim(cr.nome_no_equipamento), ''), 'Aluno ' || cr.referencia)
    FROM public.academia_credenciais cr
   -- Aluna cadastrada no painel de outra academia do grupo tambem precisa
   -- nascer neste leitor: e o unico que existe para ela.
   WHERE cr.partner_id IN (SELECT g.partner_id FROM public.academia_parceiros_do_grupo(a.partner_id) g)
     AND cr.ativo
     -- `importado_em` só é preenchido quando a pessoa foi LIDA do equipamento.
     -- Nulo significa que ela nasceu na recepção e nunca existiu lá.
     AND cr.importado_em IS NULL
   ORDER BY cr.created_at
   LIMIT 50;
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_agente_faces_a_enviar(p_agente_id uuid, p_segredo text)
 RETURNS TABLE(envio_id uuid, referencia text, nome text, foto_base64 text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agente uuid;
  v_partner uuid;
BEGIN
  SELECT a.id, a.partner_id INTO v_agente, v_partner
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF v_agente IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes a SET ultimo_contato_em = now() WHERE a.id = v_agente;

  RETURN QUERY
  SELECT e.id, e.referencia, e.nome, e.foto_base64
    FROM public.academia_faces_envio e
   WHERE e.partner_id IN (SELECT g.partner_id FROM public.academia_parceiros_do_grupo(v_partner) g)
     AND e.status = 'pendente'
     AND e.foto_base64 IS NOT NULL
   ORDER BY e.criado_em
   LIMIT 5;
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_agente_face_enviada_confirmar(p_agente_id uuid, p_segredo text, p_envio_id uuid, p_ok boolean, p_erro text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_agente uuid;
  v_partner uuid;
  e RECORD;
BEGIN
  SELECT a.id, a.partner_id INTO v_agente, v_partner
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF v_agente IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO e FROM public.academia_faces_envio
   WHERE id = p_envio_id
     AND partner_id IN (SELECT g.partner_id FROM public.academia_parceiros_do_grupo(v_partner) g);
  IF e.id IS NULL THEN RETURN false; END IF;

  IF NOT p_ok THEN
    UPDATE public.academia_faces_envio
       SET status = 'erro', erro = left(COALESCE(p_erro, 'falha desconhecida'), 400)
     WHERE id = p_envio_id;
    RETURN false;
  END IF;

  -- A biometria agora vive no leitor. Nao ha motivo para ela continuar aqui.
  UPDATE public.academia_faces_envio
     SET status = 'enviado', enviado_em = now(), foto_base64 = NULL, erro = NULL
   WHERE id = p_envio_id;

  -- A credencial nasce na academia que pediu o envio, nao na dona do leitor.
  INSERT INTO public.academia_credenciais
    (partner_id, student_id, tipo, referencia, nome_no_equipamento, ativo)
  VALUES
    (e.partner_id, e.student_id, 'facial', e.referencia, e.nome, true)
  ON CONFLICT ON CONSTRAINT academia_credencial_unica DO UPDATE
    SET student_id = COALESCE(public.academia_credenciais.student_id, EXCLUDED.student_id),
        nome_no_equipamento = COALESCE(EXCLUDED.nome_no_equipamento,
                                       public.academia_credenciais.nome_no_equipamento),
        ativo = true;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_agente_marcar_rostos(p_agente_id uuid, p_segredo text, p_com_rosto jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   WHERE partner_id IN (SELECT g.partner_id FROM public.academia_parceiros_do_grupo(v_partner) g)
     AND referencia = ANY(v_refs) AND rosto_em IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'marcados', v_n);
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_agente_pessoas(p_agente_id uuid, p_segredo text, p_busca text DEFAULT NULL::text)
 RETURNS TABLE(referencia text, nome text, telefone text, nascimento date, ativo boolean, no_leitor boolean, plano text, valido_ate date, motivo text, entradas integer, ultima_entrada date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- A recepcao do leitor atende o grupo inteiro: acha aluna de qualquer
  -- academia dele, e cada numero sai da academia DELA.
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
       WHERE me.partner_id = cr.partner_id AND me.status = 'ativa'
         AND me.credencial_id = cr.id
       ORDER BY me.valido_ate DESC LIMIT 1
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT a2.valido_ate, a2.motivo
        FROM public.acesso_avaliar_academia(cr.partner_id) a2
       WHERE a2.credencial_id = cr.id LIMIT 1
    ) av ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS entradas,
             max((fr.entrada_em AT TIME ZONE v_tz)::date) AS ultima
        FROM public.academia_frequencias fr
       WHERE fr.partner_id = cr.partner_id AND fr.credencial_id = cr.id
    ) f ON true
   WHERE cr.partner_id IN (SELECT g.partner_id FROM public.academia_parceiros_do_grupo(v_partner) g)
     AND (v_termo = ''
       OR public.sem_acento(cr.nome_no_equipamento) LIKE '%' || public.sem_acento(v_termo) || '%'
       OR cr.referencia = v_termo
       OR (v_digitos <> ''
           AND regexp_replace(COALESCE(cr.telefone, ''), '\D', '', 'g') LIKE '%' || v_digitos || '%'))
   ORDER BY cr.ativo DESC, cr.nome_no_equipamento
   LIMIT 40;
END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_agente_credencial_desligar(p_agente_id uuid, p_segredo text, p_referencia text, p_forcar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
   WHERE c.id = public.academia_credencial_no_grupo(v_partner, p_referencia);
  IF cr.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Não achei essa pessoa nesta academia.');
  END IF;

  IF NOT cr.ativo THEN
    RETURN jsonb_build_object('ok', true, 'ja_estava', true);
  END IF;

  SELECT me.plano, me.valido_ate INTO v_mens
    FROM public.academia_mensalidades me
   WHERE me.partner_id = cr.partner_id AND me.credencial_id = cr.id
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
$function$;

CREATE OR REPLACE FUNCTION public.academia_agente_credencial_editar(p_agente_id uuid, p_segredo text, p_referencia text, p_nome text DEFAULT NULL::text, p_telefone text DEFAULT NULL::text, p_nascimento date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  v_id := public.academia_credencial_no_grupo(v_partner, p_referencia);
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
$function$;

-- ------------------------------------------------------------- transferencia

/**
 * Leva pessoas de uma academia para outra do MESMO grupo, com o historico.
 *
 * Mesmo grupo e condicao: e o grupo que faz o leitor continuar reconhecendo a
 * pessoa depois da troca. Anda junto tudo que e da pessoa -- mensalidades (os
 * pagamentos seguem a mensalidade), frequencias, barradas, avisos e envio de
 * rosto. Fica na origem o que e da origem: turma, reserva e comparacao de
 * sombra do equipamento. Cartao aberto no funil da origem e arquivado com a
 * nota, nunca apagado.
 *
 * Sem acesso de fora: roda pelo MCP, com os ids conferidos antes.
 */
CREATE OR REPLACE FUNCTION public.academia_transferir_credenciais(p_origem uuid, p_destino uuid, p_credenciais uuid[], p_nota text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fora text;
  v_choque text;
  v_refs text[];
  v_alunos uuid[];
  v_cartoes uuid[];
  v_saida jsonb := '{}'::jsonb;
  n integer;
BEGIN
  IF p_origem = p_destino THEN
    RAISE EXCEPTION 'Origem e destino sao a mesma academia.';
  END IF;
  IF COALESCE(cardinality(p_credenciais), 0) = 0 THEN
    RAISE EXCEPTION 'Nenhuma credencial informada.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.academia_parceiros_do_grupo(p_origem) g WHERE g.partner_id = p_destino) THEN
    RAISE EXCEPTION 'As academias nao dividem equipamento: a pessoa perderia a catraca.';
  END IF;

  SELECT string_agg(x::text, ', ') INTO v_fora
    FROM unnest(p_credenciais) x
   WHERE NOT EXISTS (SELECT 1 FROM public.academia_credenciais c WHERE c.id = x AND c.partner_id = p_origem);
  IF v_fora IS NOT NULL THEN
    RAISE EXCEPTION 'Credenciais que nao sao da academia de origem: %', v_fora;
  END IF;

  SELECT string_agg(c.referencia, ', ') INTO v_choque
    FROM public.academia_credenciais c
    JOIN public.academia_credenciais d
      ON d.partner_id = p_destino AND d.tipo = c.tipo AND d.referencia = c.referencia
   WHERE c.id = ANY(p_credenciais);
  IF v_choque IS NOT NULL THEN
    RAISE EXCEPTION 'A academia de destino ja tem estas referencias: %', v_choque;
  END IF;

  SELECT array_agg(c.referencia), array_agg(c.student_id) FILTER (WHERE c.student_id IS NOT NULL)
    INTO v_refs, v_alunos
    FROM public.academia_credenciais c WHERE c.id = ANY(p_credenciais);

  SELECT array_agg(DISTINCT ca.id) INTO v_cartoes
    FROM public.academia_crm_cartoes ac
    JOIN public.crm_cartoes ca ON ca.id = ac.cartao_id
   WHERE ac.partner_id = p_origem AND ac.credencial_id = ANY(p_credenciais) AND ca.arquivado_em IS NULL;
  IF v_cartoes IS NOT NULL THEN
    INSERT INTO public.crm_atividades (cartao_id, tipo, corpo)
    SELECT x, 'sistema', p_nota FROM unnest(v_cartoes) x;
    UPDATE public.crm_cartoes SET arquivado_em = now() WHERE id = ANY(v_cartoes);
  END IF;
  v_saida := v_saida || jsonb_build_object('cartoes_arquivados', COALESCE(cardinality(v_cartoes), 0));

  UPDATE public.academia_mensalidades SET partner_id = p_destino
   WHERE partner_id = p_origem
     AND (credencial_id = ANY(p_credenciais)
       OR (credencial_id IS NULL AND student_id = ANY(COALESCE(v_alunos, '{}'))));
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('mensalidades', n);

  UPDATE public.academia_frequencias SET partner_id = p_destino
   WHERE partner_id = p_origem
     AND (credencial_id = ANY(p_credenciais)
       OR (credencial_id IS NULL AND student_id = ANY(COALESCE(v_alunos, '{}'))));
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('frequencias', n);

  UPDATE public.academia_acessos_negados SET partner_id = p_destino
   WHERE partner_id = p_origem AND referencia = ANY(v_refs);
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('barradas', n);

  UPDATE public.academia_avisos SET partner_id = p_destino
   WHERE partner_id = p_origem AND credencial_id = ANY(p_credenciais);
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('avisos', n);

  UPDATE public.academia_faces_envio SET partner_id = p_destino
   WHERE partner_id = p_origem AND referencia = ANY(v_refs);
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('envios_de_rosto', n);

  UPDATE public.academia_credenciais SET partner_id = p_destino WHERE id = ANY(p_credenciais);
  GET DIAGNOSTICS n = ROW_COUNT; v_saida := v_saida || jsonb_build_object('credenciais', n);

  RETURN v_saida;
END;
$function$;

REVOKE ALL ON FUNCTION public.academia_transferir_credenciais(uuid, uuid, uuid[], text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------- aplicado em 14/09
--
-- Executado uma vez pelo MCP, depois das funcoes acima (nao repetir: a
-- funcao recusa credencial que ja nao e da origem):
--
--   SELECT public.academia_transferir_credenciais(
--     '646c99dd-23cc-4da5-ba96-e52cfb1384b4',   -- Estacao Funcional
--     'afcad56d-247c-48b7-bed0-7ea0ee30ae08',   -- Jessica
--     ARRAY[
--       '8af599f6-eafe-4be8-ad41-7a01bb7c516e',  -- 257 Aline Costa Monteiro
--       'cf83ab4f-98e3-4dac-830e-cf6a8f6d0889',  -- 126 Gislaine Carvalho
--       '61108a10-649b-4b44-8e6b-aad86990a7a3',  --   6 Jessica Aparecida Cerqueira de Campos
--       '5dcb1657-74fc-4347-aa53-6bb29c8db7f9',  --  13 Leidiane C C da Silva
--       '0dee1f4d-9f45-48ad-a603-7155b8af73be',  -- 269 Keila Maciel Silva
--       '0ef54272-1e04-474e-806f-becc2b6dfe48',  -- 134 Claudenice da Silva
--       '065741fd-0ef6-4713-b2ce-ab839283eb63',  --  30 Camila de Jesus Baez
--       '3dbf97ec-b5f7-4c0b-9162-4ba66979df36',  -- 271 Jozilene Lima Marinho
--       '22a4e3e1-8500-4ed0-a1db-c7f8d5fc9bf6',  -- 113 Carolyne Ewelly da Silva
--       '947d01f0-098b-4395-88cd-3157df657e3a'   -- 138 Andreia Borges Ofrasio
--     ]::uuid[],
--     'Transferida para a academia Jessica em 14/09/2026.'
--   );
--
-- Pendentes de confirmacao do Erick: "Anna Karoline" (candidata: Ana Karoliny
-- dos Santos Oliveira, ref 40) e "Karolina Camargo" (candidata: Karoline camargo
-- costa, ref 81).
