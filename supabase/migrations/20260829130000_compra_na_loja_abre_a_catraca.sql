-- Compra na loja abre a catraca.
--
-- A cadeia transactions(paid) -> academia_mensalidade_gerar -> academia_mensalidades
-- ja existia, mas parava em dois pontos, os dois provados contra a Estacao
-- (partner 646c99dd-23cc-4da5-ba96-e52cfb1384b4):
--
--   1) academia_pagamento_confirmado exigia um mercadopago_payments com
--      source_kind='transaction'. Nao existe nenhum: a loja fecha o pagamento
--      contra o PEDIDO (source_kind='store_order'). Resultado medido antes desta
--      migration: 0 de 103 transacoes pagas passavam no portao. A cadeia estava
--      morta para todo mundo, nao so para quem nao tem cadastro.
--
--   2) a mensalidade nascia com student_id preenchido e credencial_id NULL, mas
--      a catraca avalia por CREDENCIAL. Das 413 credenciais ativas da Estacao,
--      412 tem student_id NULL (vieram da planilha do sistema antigo), e para
--      essas o ramo "casa pelo aluno" nunca dispara -- medido: 0 de 412.
--      A pessoa pagaria e continuaria bloqueada.
--
-- Nada disso chegou a acontecer em producao porque academia_produtos_mensalidade
-- esta vazia: nenhum produto de loja esta ligado a plano ainda.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Normalizacao das duas pontas, para conciliar credencial com aluno.
-- ---------------------------------------------------------------------------

-- Os dois lados guardam telefone em formatos diferentes: a credencial veio da
-- planilha como "(65) 9 8401-3711" e o perfil da plataforma so com digitos.
-- Normalizar um lado so ja quebrou um casamento aqui antes.
CREATE OR REPLACE FUNCTION public.academia_telefone_digitos(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH so_digitos AS (
    SELECT regexp_replace(COALESCE(p_texto, ''), '\D', '', 'g') AS n
  ),
  sem_ddi AS (
    -- 12 e 13 digitos so fazem sentido com o 55 na frente.
    SELECT CASE WHEN length(n) IN (12, 13) AND left(n, 2) = '55'
                THEN substr(n, 3) ELSE n END AS n
      FROM so_digitos
  )
  SELECT CASE
           WHEN length(n) = 11 THEN n
           -- Numero de 10 digitos ganha o nono, que e como a plataforma guarda.
           -- Fixo tambem cai aqui e vira um numero que nao existe -- tudo bem:
           -- as duas pontas passam por esta mesma funcao, entao o fixo continua
           -- casando com ele mesmo.
           WHEN length(n) = 10 THEN substr(n, 1, 2) || '9' || substr(n, 3)
           -- Sem DDD nao da para afirmar que sao a mesma pessoa.
           ELSE NULL
         END
    FROM sem_ddi;
$$;

-- A extensao unaccent nao esta instalada neste banco; a dobra de acento vai na
-- mao. Sem isso "Roselandia" nunca casaria com "Roselandia" acentuado.
CREATE OR REPLACE FUNCTION public.academia_nome_chave(p_texto text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(btrim(regexp_replace(
    lower(translate(COALESCE(p_texto, ''),
      'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇçÑñ',
      'aaaaaaaaaaeeeeeeeeiiiiiiiioooooooooouuuuuuuuccnn')),
    '[^a-z0-9]+', ' ', 'g')), '');
$$;

-- ---------------------------------------------------------------------------
-- 2. O portao de pagamento passa a enxergar a rota que a loja realmente usa.
-- ---------------------------------------------------------------------------
--
-- A exigencia de prova continua a MESMA: um approved do proprio Mercado Pago.
-- Muda so a chave por onde esse approved foi gravado.
CREATE OR REPLACE FUNCTION public.academia_pagamento_confirmado(p_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gateway text;
BEGIN
  SELECT value INTO v_gateway FROM public.app_settings WHERE key = 'checkout_ativo';
  v_gateway := COALESCE(v_gateway, 'mercadopago');

  -- Gateway desconhecido: nao libera por conta propria. Melhor a academia
  -- lancar a mao do que o sistema liberar sem ter conferido com ninguem.
  IF v_gateway <> 'mercadopago' THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.mercadopago_payments m
     WHERE m.status = 'approved'
       AND (
         -- Rota direta: o pagamento foi aberto contra a propria transacao.
         (m.source_kind = 'transaction' AND m.source_id = p_transaction_id)
         -- Rota da loja: o pagamento e do PEDIDO, e a transacao aponta para ele
         -- pelo metadata. E por aqui que passam as 103 compras pagas de hoje.
         OR (m.source_kind = 'store_order'
             AND m.source_id::text = (SELECT t.metadata->>'store_order_id'
                                        FROM public.transactions t
                                       WHERE t.id = p_transaction_id))
       )
  );
END;
$$;

COMMIT;

-- ---------------------------------------------------------------------------
-- 3. academia_mensalidade_gerar passa a resolver a credencial.
-- ---------------------------------------------------------------------------
--
-- Editada por SUBSTITUICAO no corpo publicado: e uma funcao grande e correta,
-- e transcrever o resto a mao so criaria chance de errar o que ja esta certo.
-- Se qualquer trecho nao casar exatamente, o bloco aborta sem publicar nada.
DO $do$
DECLARE
  v_src  text;
  v_novo text;
  v_args text;
  v_de   text;
  v_para text;
BEGIN
  SELECT p.prosrc, pg_get_function_arguments(p.oid)
    INTO v_src, v_args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'academia_mensalidade_gerar';

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'academia_mensalidade_gerar nao encontrada.';
  END IF;

  v_novo := v_src;

  -- (a) duas variaveis novas
  v_de := '  v_novo date;' || chr(10) || 'BEGIN';
  v_para := '  v_novo date;' || chr(10)
         || '  v_credencial uuid;' || chr(10)
         || '  v_limite integer;' || chr(10)
         || 'BEGIN';
  IF position(v_de in v_novo) = 0 THEN
    RAISE EXCEPTION 'Trecho (a) nao casou; nada foi publicado.';
  END IF;
  v_novo := replace(v_novo, v_de, v_para);

  -- (b) resolve a credencial e passa a olhar as DUAS pontas ao somar o
  --     vencimento atual, do mesmo jeito que academia_renovar ja faz.
  v_de := '  SELECT max(a.valido_ate) INTO v_atual' || chr(10)
       || '    FROM public.academia_mensalidades a' || chr(10)
       || '   WHERE a.partner_id = v_map.partner_id' || chr(10)
       || '     AND a.student_id = t.student_id' || chr(10)
       || '     AND a.status = ''ativa'';' || chr(10);
  v_para := '  -- A catraca avalia por CREDENCIAL. Gravar so o student_id deixa a'   || chr(10)
         || '  -- mensalidade pendurada numa chave que a credencial da pessoa nao'   || chr(10)
         || '  -- conhece: ela paga e continua bloqueada na porta.'                  || chr(10)
         || '  SELECT c.id INTO v_credencial'                                        || chr(10)
         || '    FROM public.academia_credenciais c'                                 || chr(10)
         || '   WHERE c.partner_id = v_map.partner_id'                               || chr(10)
         || '     AND c.student_id = t.student_id'                                   || chr(10)
         || '     AND c.ativo'                                                       || chr(10)
         || '   ORDER BY c.created_at'                                               || chr(10)
         || '   LIMIT 1;'                                                            || chr(10)
         || ''                                                                       || chr(10)
         || '  -- O limite do plano vira limite DESTA venda. Sem isto, um plano de'  || chr(10)
         || '  -- 3x por semana comprado na loja daria acesso livre.'                || chr(10)
         || '  SELECT pl.limite_dias_semana INTO v_limite'                           || chr(10)
         || '    FROM public.academia_plano_do_texto(v_map.partner_id, v_map.plano) pl;' || chr(10)
         || ''                                                                       || chr(10)
         || '  -- As duas pontas: quem ja tinha mensalidade lancada na recepcao tem'  || chr(10)
         || '  -- credencial_id, quem comprou pelo app tem student_id. Olhar so uma'  || chr(10)
         || '  -- ponta faria a renovacao ignorar os dias que a pessoa ja pagou.'     || chr(10)
         || '  SELECT max(a.valido_ate) INTO v_atual'                                || chr(10)
         || '    FROM public.academia_mensalidades a'                                || chr(10)
         || '   WHERE a.partner_id = v_map.partner_id'                               || chr(10)
         || '     AND a.status = ''ativa'''                                          || chr(10)
         || '     AND ((v_credencial IS NOT NULL AND a.credencial_id = v_credencial)' || chr(10)
         || '       OR (t.student_id IS NOT NULL AND a.student_id = t.student_id));'  || chr(10);
  IF position(v_de in v_novo) = 0 THEN
    RAISE EXCEPTION 'Trecho (b) nao casou; nada foi publicado.';
  END IF;
  v_novo := replace(v_novo, v_de, v_para);

  -- (c) grava a credencial e o limite semanal junto
  v_de := '    partner_id, student_id, plano, valor, valido_ate, origem, forma_pagamento,' || chr(10)
       || '    taxa_percentual, taxa_valor, valor_liquido, transaction_id, observacao'     || chr(10)
       || '  ) VALUES ('                                                                  || chr(10)
       || '    v_map.partner_id, t.student_id, v_map.plano, t.gross_amount, v_novo, ''interna'',' || chr(10);
  v_para := '    partner_id, student_id, credencial_id, plano, valor, valido_ate, origem,' || chr(10)
         || '    forma_pagamento, taxa_percentual, taxa_valor, valor_liquido,'             || chr(10)
         || '    transaction_id, observacao, limite_dias_semana'                           || chr(10)
         || '  ) VALUES ('                                                                 || chr(10)
         || '    v_map.partner_id, t.student_id, v_credencial, v_map.plano, t.gross_amount,' || chr(10)
         || '    v_novo, ''interna'','                                                     || chr(10);
  IF position(v_de in v_novo) = 0 THEN
    RAISE EXCEPTION 'Trecho (c) nao casou; nada foi publicado.';
  END IF;
  v_novo := replace(v_novo, v_de, v_para);

  -- (d) a lista de VALUES ganha o limite no fim, junto da observacao
  v_de := '    ''Liberado automaticamente pela compra na plataforma.''' || chr(10)
       || '  )' || chr(10)
       || '  ON CONFLICT DO NOTHING;';
  v_para := '    ''Liberado automaticamente pela compra na plataforma.'',' || chr(10)
         || '    v_limite' || chr(10)
         || '  )' || chr(10)
         || '  ON CONFLICT DO NOTHING;';
  IF position(v_de in v_novo) = 0 THEN
    RAISE EXCEPTION 'Trecho (d) nao casou; nada foi publicado.';
  END IF;
  v_novo := replace(v_novo, v_de, v_para);

  -- pg_get_function_arguments (e nao _identity_arguments) para nao descartar os
  -- DEFAULT e o Postgres recusar com "cannot remove parameter defaults".
  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.academia_mensalidade_gerar(%s) RETURNS boolean '
    'LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L',
    v_args, v_novo);

  -- Esta funcao nao tem corpo literal no arquivo -- ela e o resultado das quatro
  -- substituicoes acima. A conferencia de md5 exigida pelo CLAUDE.md fica aqui,
  -- entao o arquivo continua sendo a verdade: se o corpo publicado nao for
  -- exatamente este, a migration falha em vez de deixar a duvida no banco.
  IF md5(v_novo) <> '81a121cd2eb6ae66878bbe32d3b74e9b' THEN
    RAISE EXCEPTION 'Corpo publicado de academia_mensalidade_gerar nao confere: md5 % (esperado 81a121cd2eb6ae66878bbe32d3b74e9b).', md5(v_novo);
  END IF;
END;
$do$;

BEGIN;

-- ---------------------------------------------------------------------------
-- 4. Conciliacao: casar as credenciais importadas com os alunos da plataforma.
-- ---------------------------------------------------------------------------
--
-- Vincular a pessoa errada da a academia para quem nao pagou e nega para quem
-- pagou. Por isso so existe UM nivel automatico ('alta'), e ele exige as duas
-- evidencias ao mesmo tempo: telefone identico e unico dos dois lados E nome
-- que concorda. So telefone nao basta -- na Estacao ha um telefone de familia
-- com dois alunos e um perfil chamado "Meu mundinho BTS" cujo telefone bate com
-- a credencial de outra pessoa.
CREATE OR REPLACE FUNCTION public.academia_credenciais_sugerir_vinculo(p_partner_id uuid)
RETURNS TABLE(
  credencial_id uuid,
  nome text,
  telefone text,
  student_id uuid,
  aluno text,
  aluno_telefone text,
  confianca text,
  motivo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH cred AS (
    SELECT c.id,
           c.nome_no_equipamento AS nome,
           c.telefone,
           public.academia_telefone_digitos(c.telefone) AS tel,
           public.academia_nome_chave(c.nome_no_equipamento) AS chave
      FROM public.academia_credenciais c
     WHERE c.partner_id = p_partner_id
       AND c.ativo
       AND c.student_id IS NULL
  ),
  -- Universo deliberadamente estreito. Varrer todos os alunos da plataforma
  -- mostraria gente de outras academias para quem nao tem nada a ver com elas.
  -- Aqui entra so quem ja tem relacao com esta unidade, mais quem bate com um
  -- telefone que a PROPRIA academia ja tem na credencial.
  aluno AS (
    SELECT s.id AS student_id,
           pr.name::text AS nome,
           pr.phone::text AS telefone,
           public.academia_telefone_digitos(pr.phone) AS tel,
           public.academia_nome_chave(pr.name) AS chave
      FROM public.students s
      JOIN public.profiles pr ON pr.id = s.profile_id
     WHERE s.id IN (SELECT a.student_id FROM public.academia_alunos_da_unidade(p_partner_id) a)
        OR public.academia_telefone_digitos(pr.phone) IN (SELECT c.tel FROM cred c WHERE c.tel IS NOT NULL)
  ),
  -- Um aluno ja usado por outra credencial desta academia nao pode ser sugerido
  -- de novo: duas credenciais apontando para o mesmo aluno bagunca a avaliacao.
  livre AS (
    SELECT a.* FROM aluno a
     WHERE NOT EXISTS (
       SELECT 1 FROM public.academia_credenciais o
        WHERE o.partner_id = p_partner_id AND o.student_id = a.student_id
     )
  ),
  par AS (
    SELECT c.id AS cred_id, c.nome AS cred_nome, c.telefone AS cred_tel,
           a.student_id, a.nome AS aluno_nome, a.telefone AS aluno_tel,
           (c.tel IS NOT NULL AND c.tel = a.tel) AS bate_telefone,
           similarity(c.chave, a.chave) AS sem,
           (split_part(c.chave, ' ', 1) = split_part(a.chave, ' ', 1)) AS mesmo_primeiro_nome,
           EXISTS (
             SELECT 1
               FROM unnest(string_to_array(c.chave, ' ')) tc
               JOIN unnest(string_to_array(a.chave, ' ')) ta ON ta = tc
              WHERE length(tc) >= 3
                AND tc <> split_part(c.chave, ' ', 1)
           ) AS sobrenome_em_comum
      FROM cred c
      JOIN livre a
        ON (c.tel IS NOT NULL AND c.tel = a.tel)
        OR (c.chave IS NOT NULL AND a.chave IS NOT NULL AND similarity(c.chave, a.chave) >= 0.55)
  ),
  contado AS (
    SELECT p.*,
           count(*) OVER (PARTITION BY p.cred_id)    AS alunos_para_a_credencial,
           count(*) OVER (PARTITION BY p.student_id) AS credenciais_para_o_aluno
      FROM par p
  )
  SELECT x.cred_id, x.cred_nome, x.cred_tel,
         x.student_id, x.aluno_nome, x.aluno_tel,
         x.confianca, x.motivo
    FROM (
      SELECT c.*,
             CASE
               WHEN c.bate_telefone
                AND c.alunos_para_a_credencial = 1
                AND c.credenciais_para_o_aluno = 1
                AND c.mesmo_primeiro_nome
                AND (c.sobrenome_em_comum OR c.sem >= 0.60)
                 THEN 'alta'
               WHEN c.bate_telefone
                AND c.alunos_para_a_credencial = 1
                AND c.credenciais_para_o_aluno = 1
                 THEN 'media'
               ELSE 'baixa'
             END AS confianca,
             CASE
               WHEN c.bate_telefone AND c.alunos_para_a_credencial > 1
                 THEN 'telefone bate, mas ha ' || c.alunos_para_a_credencial
                      || ' alunos com o mesmo numero -- confirme quem e'
               WHEN c.bate_telefone AND c.credenciais_para_o_aluno > 1
                 THEN 'telefone bate, mas este aluno serve a mais de uma credencial'
               WHEN c.bate_telefone AND NOT c.mesmo_primeiro_nome
                 THEN 'telefone identico, mas os nomes nao batem -- pode ser telefone de familia'
               WHEN c.bate_telefone AND NOT (c.sobrenome_em_comum OR c.sem >= 0.60)
                 THEN 'telefone identico e primeiro nome igual, mas o sobrenome diverge'
               WHEN c.bate_telefone
                 THEN 'telefone identico e unico dos dois lados, e o nome confere'
               ELSE 'so o nome se parece (' || round(c.sem::numeric, 2) || ') -- sem telefone que confirme'
             END AS motivo
        FROM contado c
    ) x
   ORDER BY CASE x.confianca WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
            x.sem DESC, x.cred_nome;
END;
$$;

-- Aplica o vinculo. Serve tanto para o caso automatico ('alta') quanto para o
-- que um humano confirmou na tela -- em ambos passa pelas mesmas guardas.
CREATE OR REPLACE FUNCTION public.academia_credencial_vincular(
  p_credencial_id uuid,
  p_student_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner uuid;
  v_atual uuid;
  v_nome text;
  v_ocupada uuid;
  v_backfill integer := 0;
BEGIN
  SELECT c.partner_id, c.student_id, c.nome_no_equipamento
    INTO v_partner, v_atual, v_nome
    FROM public.academia_credenciais c
   WHERE c.id = p_credencial_id;

  IF v_partner IS NULL THEN
    RAISE EXCEPTION 'Credencial nao encontrada.';
  END IF;

  IF NOT public.academia_pode_ver(v_partner) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_student_id IS NULL THEN
    RAISE EXCEPTION 'Informe o aluno.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student_id) THEN
    RAISE EXCEPTION 'Aluno nao encontrado.';
  END IF;

  IF v_atual = p_student_id THEN
    RETURN jsonb_build_object(
      'ok', true, 'mudou', false, 'credencial_id', p_credencial_id,
      'student_id', p_student_id, 'mensalidades_religadas', 0,
      'relato', 'A credencial ja estava vinculada a este aluno.');
  END IF;

  -- Trocar o dono de uma credencial que ja tem aluno e outra operacao, e nao
  -- pode acontecer por engano de uma conciliacao automatica.
  IF v_atual IS NOT NULL THEN
    RAISE EXCEPTION 'A credencial % ja esta vinculada a outro aluno. Desvincule antes.', p_credencial_id;
  END IF;

  -- Duas credenciais apontando para o mesmo aluno fariam a mesma mensalidade
  -- valer para duas pessoas no leitor.
  SELECT o.id INTO v_ocupada
    FROM public.academia_credenciais o
   WHERE o.partner_id = v_partner
     AND o.student_id = p_student_id
     AND o.id <> p_credencial_id
   LIMIT 1;

  IF v_ocupada IS NOT NULL THEN
    RAISE EXCEPTION 'Este aluno ja esta vinculado a credencial % nesta academia.', v_ocupada;
  END IF;

  UPDATE public.academia_credenciais
     SET student_id = p_student_id
   WHERE id = p_credencial_id;

  -- Rede de seguranca: o que a pessoa ja pagou como ALUNO passa a valer para a
  -- credencial. Sem isto, uma mensalidade antiga com credencial_id NULL e uma
  -- nova com credencial_id viram DUAS pessoas na avaliacao, e a catraca pode
  -- ler justamente a linha vencida.
  UPDATE public.academia_mensalidades m
     SET credencial_id = p_credencial_id,
         updated_at = now()
   WHERE m.partner_id = v_partner
     AND m.student_id = p_student_id
     AND m.credencial_id IS NULL;
  GET DIAGNOSTICS v_backfill = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'mudou', true,
    'credencial_id', p_credencial_id,
    'credencial_nome', v_nome,
    'student_id', p_student_id,
    'mensalidades_religadas', v_backfill,
    'relato', format('Credencial "%s" vinculada ao aluno; %s mensalidade(s) passaram a valer para ela.',
                     COALESCE(v_nome, '(sem nome)'), v_backfill));
END;
$$;

REVOKE ALL ON FUNCTION public.academia_credenciais_sugerir_vinculo(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.academia_credencial_vincular(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_credenciais_sugerir_vinculo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.academia_credencial_vincular(uuid, uuid) TO authenticated;

COMMIT;
