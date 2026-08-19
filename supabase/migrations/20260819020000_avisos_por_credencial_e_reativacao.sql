-- Avisos e remarketing para aluno de academia, e a volta de quem parou.
--
-- DOIS PROBLEMAS:
--
-- 1) A maquina de avisos so enxergava aluno da plataforma. Ela ia de
--    acesso_avaliar_academia -> students -> profiles para achar nome e telefone.
--    Depois da 20260819010000, mensalidade pode pertencer a uma CREDENCIAL, e
--    essas 400 pessoas nunca apareceriam. Pior: acesso_avaliar_academia fazia
--    DISTINCT ON (student_id), entao todas as mensalidades sem aluno colapsavam
--    numa linha so.
--
-- 2) Nao existia marco para quem JA parou. d3, d2, d1, d0 e ultimo_dia estao
--    todos colados no vencimento; quem parou ha seis meses nao cai em nenhum.
--    Remarketing de reativacao precisava de caminho proprio.
--
-- NADA AQUI ENVIA. Continua valendo a disciplina: monta campanha em rascunho,
-- quem envia e o dispararCampanha, onde ficam limite diario do chip e intervalo.

-- ===========================================================================
-- 1) O aviso passa a ter as duas pontas, igual a mensalidade
-- ===========================================================================

ALTER TABLE public.academia_avisos
  ADD COLUMN IF NOT EXISTS credencial_id uuid REFERENCES public.academia_credenciais(id) ON DELETE CASCADE;
ALTER TABLE public.academia_avisos ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE public.academia_avisos DROP CONSTRAINT IF EXISTS academia_aviso_unico;
DROP INDEX IF EXISTS public.academia_aviso_unico;

-- Chave por PESSOA, seja ela aluno da plataforma ou so da academia. Com NULL a
-- unicidade some (NULL nunca e igual a NULL), entao a chave usa COALESCE — sem
-- isso o mesmo aviso sairia todo dia para a mesma pessoa.
CREATE UNIQUE INDEX academia_aviso_unico
  ON public.academia_avisos
     (partner_id, COALESCE(credencial_id::text, student_id::text), valido_ate, marco);

-- O CHECK do marco so aceitava d3, d2, d1 e d0. Nao aceitava nem 'ultimo_dia',
-- que a propria maquina ja gerava — defeito latente que nunca apareceu porque
-- nenhuma campanha chegou a ser montada. Agora aceita os marcos de reativacao
-- tambem.
ALTER TABLE public.academia_avisos DROP CONSTRAINT IF EXISTS academia_avisos_marco_check;
ALTER TABLE public.academia_avisos ADD CONSTRAINT academia_avisos_marco_check
  CHECK (marco = ANY (ARRAY['d3','d2','d1','d0','ultimo_dia','retorno_7','retorno_30','retorno_90','reativacao']));

ALTER TABLE public.academia_avisos_modelos DROP CONSTRAINT IF EXISTS academia_avisos_modelos_marco_check;
ALTER TABLE public.academia_avisos_modelos ADD CONSTRAINT academia_avisos_modelos_marco_check
  CHECK (marco = ANY (ARRAY['d3','d2','d1','d0','ultimo_dia','retorno_7','retorno_30','retorno_90','reativacao']));

-- ===========================================================================
-- 2) A regua passa a devolver a credencial junto
-- ===========================================================================
-- Coluna a mais, nao a menos: quem ja lia student_id continua lendo.

DROP FUNCTION IF EXISTS public.acesso_avaliar_academia(uuid);
CREATE FUNCTION public.acesso_avaliar_academia(p_partner_id uuid)
RETURNS TABLE (student_id uuid, credencial_id uuid, valido_ate date,
               decisao text, motivo text, dias_restantes integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tz text; v_carencia integer; v_hoje date;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'), COALESCE(c.dias_carencia, 3)
    INTO v_tz, v_carencia
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_carencia := COALESCE(v_carencia, 3);
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  RETURN QUERY
    SELECT m.student_id, m.credencial_id, m.valido_ate,
           cl.decisao, cl.motivo, (m.valido_ate - v_hoje)::integer
      FROM (
        -- Uma linha por PESSOA, valendo o vencimento mais longo dela.
        SELECT DISTINCT ON (COALESCE(a.credencial_id::text, a.student_id::text))
               a.student_id, a.credencial_id, a.valido_ate
          FROM public.academia_mensalidades a
         WHERE a.partner_id = p_partner_id AND a.status = 'ativa'
         ORDER BY COALESCE(a.credencial_id::text, a.student_id::text), a.valido_ate DESC
      ) m
      CROSS JOIN LATERAL public.acesso_classificar((m.valido_ate - v_hoje)::integer, v_carencia) cl;
END; $$;

REVOKE EXECUTE ON FUNCTION public.acesso_avaliar_academia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acesso_avaliar_academia(uuid) TO authenticated, service_role;

-- ===========================================================================
-- 3) Textos: os que existiam, mais os de reativacao
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.academia_aviso_texto_padrao(p_marco text)
RETURNS text LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_marco
    WHEN 'd3' THEN 'Oi {nome}! Sua mensalidade da academia vence em 3 dias, no dia {data}.'
    WHEN 'd2' THEN 'Oi {nome}! Faltam 2 dias para vencer sua mensalidade da academia ({data}).'
    WHEN 'd1' THEN 'Oi {nome}! Sua mensalidade da academia vence amanha, {data}.'
    WHEN 'd0' THEN 'Oi {nome}! Sua mensalidade da academia vence hoje ({data}). Renove para continuar treinando.'
    WHEN 'ultimo_dia' THEN 'Oi {nome}! Sua mensalidade venceu em {data} e hoje e o ultimo dia de acesso. Renove hoje para nao perder a entrada amanha.'
    -- Reativacao: tom de convite, nao de cobranca. Quem parou ja sabe que parou.
    WHEN 'retorno_7' THEN 'Oi {nome}! Faz uma semana que voce nao consegue entrar. Bora voltar? E so renovar na recepcao.'
    WHEN 'retorno_30' THEN 'Oi {nome}, tudo bem? Faz um mes que voce nao treina com a gente. Se quiser voltar, fala comigo que eu ajeito sua volta.'
    WHEN 'retorno_90' THEN 'Oi {nome}! Ja faz um tempo. A academia mudou bastante e sua vaga continua aqui. Quer dar uma passada para ver?'
    WHEN 'reativacao' THEN 'Oi {nome}! Senti sua falta nos treinos. Quer voltar? Me chama aqui que eu te explico como esta a academia agora.'
    ELSE 'Sua mensalidade da academia precisa de atencao.'
  END;
$$;

-- ===========================================================================
-- 4) Quem deve receber aviso hoje — agora com as duas pontas e a reativacao
-- ===========================================================================

DROP FUNCTION IF EXISTS public.academia_avisos_pendentes(uuid);
CREATE FUNCTION public.academia_avisos_pendentes(p_partner_id uuid)
RETURNS TABLE (student_id uuid, credencial_id uuid, nome text, telefone text,
               marco text, dias_restantes integer, valido_ate date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_carencia integer;
BEGIN
  SELECT COALESCE(c.dias_carencia, 3) INTO v_carencia
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_carencia := COALESCE(v_carencia, 3);

  RETURN QUERY
  SELECT a.student_id,
         a.credencial_id,
         -- Aluno da plataforma tem nome no perfil; aluno so da academia tem o
         -- nome que o proprio leitor conhece.
         COALESCE(pr.name, cr.nome_no_equipamento)::text,
         COALESCE(pr.phone, cr.telefone)::text,
         m.marco,
         a.dias_restantes,
         a.valido_ate
    FROM public.acesso_avaliar_academia(p_partner_id) a
    LEFT JOIN public.students s   ON s.id = a.student_id
    LEFT JOIN public.profiles pr  ON pr.id = s.profile_id
    LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
    CROSS JOIN LATERAL (
      SELECT CASE
               WHEN a.dias_restantes = 3 THEN 'd3'
               WHEN a.dias_restantes = 2 THEN 'd2'
               WHEN a.dias_restantes = 1 THEN 'd1'
               WHEN a.dias_restantes = 0 THEN 'd0'
               -- vespera do bloqueio: depende da carencia da academia,
               -- nunca de um -3 fixo
               WHEN a.dias_restantes = -v_carencia THEN 'ultimo_dia'
               -- Reativacao contada a partir do BLOQUEIO, nao do vencimento:
               -- "faz uma semana que voce nao entra" tem que ser verdade.
               WHEN a.dias_restantes = -(v_carencia + 7)  THEN 'retorno_7'
               WHEN a.dias_restantes = -(v_carencia + 30) THEN 'retorno_30'
               WHEN a.dias_restantes = -(v_carencia + 90) THEN 'retorno_90'
             END AS marco
    ) m
   WHERE m.marco IS NOT NULL
     AND COALESCE((
       SELECT mo.ativo FROM public.academia_avisos_modelos mo
        WHERE mo.partner_id = p_partner_id AND mo.marco = m.marco
     ), true)
     AND NOT EXISTS (
       SELECT 1 FROM public.academia_avisos e
        WHERE e.partner_id = p_partner_id
          AND COALESCE(e.credencial_id::text, e.student_id::text)
              = COALESCE(a.credencial_id::text, a.student_id::text)
          AND e.valido_ate = a.valido_ate
          AND e.marco = m.marco
     )
   ORDER BY a.dias_restantes DESC, COALESCE(pr.name, cr.nome_no_equipamento);
END; $$;

REVOKE EXECUTE ON FUNCTION public.academia_avisos_pendentes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_avisos_pendentes(uuid) TO authenticated, service_role;

-- ===========================================================================
-- 5) Montagem das campanhas — mesma implementacao, agora com credencial
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.academia_avisos_preparar(p_partner_id uuid)
RETURNS TABLE (marco text, contatos integer, disparo_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r RECORD; v_texto text; v_disparo uuid; v_qtd integer;
  v_hoje text := to_char(now(), 'DD/MM/YYYY');
BEGIN
  FOR r IN
    SELECT p.marco, p.valido_ate, count(*)::integer AS qtd
      FROM public.academia_avisos_pendentes(p_partner_id) p
     WHERE length(trim(COALESCE(p.telefone, ''))) >= 8
     GROUP BY p.marco, p.valido_ate
  LOOP
    SELECT COALESCE(
             (SELECT mo.texto FROM public.academia_avisos_modelos mo
               WHERE mo.partner_id = p_partner_id AND mo.marco = r.marco AND mo.ativo),
             public.academia_aviso_texto_padrao(r.marco)
           ) INTO v_texto;

    -- {data} sai aqui porque todo alvo deste marco tem o mesmo vencimento.
    -- {nome} fica para o robo resolver por pessoa no envio.
    v_texto := replace(v_texto, '{data}', to_char(r.valido_ate, 'DD/MM/YYYY'));

    INSERT INTO public.bot_disparos (escopo, owner_id, nome, mensagem, uso, status)
    VALUES ('parceiro', p_partner_id,
            'Aviso de vencimento (' || r.marco || ') — ' || v_hoje,
            v_texto, 'plataforma', 'rascunho')
    RETURNING id INTO v_disparo;

    -- Sem ON CONFLICT (disparo_id, telefone): `disparo_id` e ao mesmo tempo
    -- coluna da tabela e parametro de saida desta funcao, e o Postgres recusa
    -- por ambiguidade. A deduplicacao de telefone e feita no DISTINCT ON —
    -- duas pessoas com o mesmo numero recebem uma mensagem so, que e o certo
    -- para WhatsApp.
    INSERT INTO public.bot_disparo_alvos (disparo_id, telefone, nome)
    SELECT DISTINCT ON (trim(p.telefone)) v_disparo, trim(p.telefone), p.nome
      FROM public.academia_avisos_pendentes(p_partner_id) p
     WHERE p.marco = r.marco AND p.valido_ate = r.valido_ate
       AND length(trim(COALESCE(p.telefone, ''))) >= 8
     ORDER BY trim(p.telefone);

    -- Só depois dos alvos: falha antes daqui deixa o aviso pendente para a
    -- próxima rodada em vez de marcar alguém que não entrou em campanha.
    INSERT INTO public.academia_avisos
      (partner_id, student_id, credencial_id, marco, valido_ate, disparo_id, telefone)
    SELECT p_partner_id, p.student_id, p.credencial_id, p.marco, p.valido_ate, v_disparo, trim(p.telefone)
      FROM public.academia_avisos_pendentes(p_partner_id) p
     WHERE p.marco = r.marco AND p.valido_ate = r.valido_ate
       AND length(trim(COALESCE(p.telefone, ''))) >= 8
    ON CONFLICT DO NOTHING;

    v_qtd := r.qtd;
    marco := r.marco; contatos := v_qtd; disparo_id := v_disparo;
    RETURN NEXT;
  END LOOP;
END; $$;

REVOKE EXECUTE ON FUNCTION public.academia_avisos_preparar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_avisos_preparar(uuid) TO authenticated, service_role;

-- ===========================================================================
-- 6) A fila represada: quem ja parou antes de tudo isto existir
-- ===========================================================================
-- Os marcos automaticos so pegam quem cruzar o dia exato daqui para frente.
-- Quem parou ha meses nunca seria alcancado por eles. Esta funcao existe para
-- a primeira leva, e e MANUAL de proposito: quem dispara escolhe a faixa e o
-- teto, olhando para o tamanho da lista antes.

CREATE OR REPLACE FUNCTION public.academia_reativacao_preparar(
  p_partner_id uuid,
  p_dias_min integer DEFAULT 15,     -- parou ha pelo menos isto
  p_dias_max integer DEFAULT 365,    -- e no maximo isto
  p_limite integer DEFAULT 100       -- teto da leva
)
RETURNS TABLE (contatos integer, disparo_id uuid)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_texto text; v_disparo uuid; v_qtd integer;
  v_hoje text := to_char(now(), 'DD/MM/YYYY');
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_limite < 1 OR p_limite > 500 THEN
    RAISE EXCEPTION 'O teto da leva precisa ficar entre 1 e 500.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(
           (SELECT mo.texto FROM public.academia_avisos_modelos mo
             WHERE mo.partner_id = p_partner_id AND mo.marco = 'reativacao' AND mo.ativo),
           public.academia_aviso_texto_padrao('reativacao')
         ) INTO v_texto;

  -- Sem {data}: cada pessoa parou num dia diferente.
  v_texto := replace(v_texto, '{data}', '');

  DROP TABLE IF EXISTS _alvos;
  -- Um alvo por TELEFONE: duas pessoas com o mesmo numero recebem uma mensagem
  -- so, que e o certo para WhatsApp.
  CREATE TEMP TABLE _alvos ON COMMIT DROP AS
  SELECT DISTINCT ON (trim(COALESCE(pr.phone, cr.telefone)))
         a.student_id, a.credencial_id, a.valido_ate, a.dias_restantes,
         COALESCE(pr.name, cr.nome_no_equipamento)::text AS nome,
         trim(COALESCE(pr.phone, cr.telefone))::text AS telefone
    FROM public.acesso_avaliar_academia(p_partner_id) a
    LEFT JOIN public.students s  ON s.id = a.student_id
    LEFT JOIN public.profiles pr ON pr.id = s.profile_id
    LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
   WHERE a.dias_restantes <= -p_dias_min
     AND a.dias_restantes >= -p_dias_max
     AND length(trim(COALESCE(pr.phone, cr.telefone, ''))) >= 8
     AND NOT EXISTS (
       SELECT 1 FROM public.academia_avisos e
        WHERE e.partner_id = p_partner_id
          AND COALESCE(e.credencial_id::text, e.student_id::text)
              = COALESCE(a.credencial_id::text, a.student_id::text)
          AND e.valido_ate = a.valido_ate AND e.marco = 'reativacao'
     )
   ORDER BY trim(COALESCE(pr.phone, cr.telefone)), a.dias_restantes DESC;

  -- Quem parou ha menos tempo primeiro: volta mais facil.
  DELETE FROM _alvos WHERE ctid NOT IN (
    SELECT ctid FROM _alvos ORDER BY dias_restantes DESC LIMIT p_limite
  );

  SELECT count(*)::integer INTO v_qtd FROM _alvos;
  IF v_qtd = 0 THEN contatos := 0; disparo_id := NULL; RETURN NEXT; RETURN; END IF;

  INSERT INTO public.bot_disparos (escopo, owner_id, nome, mensagem, uso, status)
  VALUES ('parceiro', p_partner_id,
          'Reativacao (' || p_dias_min || ' a ' || p_dias_max || ' dias) — ' || v_hoje,
          v_texto, 'plataforma', 'rascunho')
  RETURNING id INTO v_disparo;

  -- Sem ON CONFLICT: a coluna disparo_id colidiria com o parametro de saida de
  -- mesmo nome. A deduplicacao ja foi feita na selecao.
  INSERT INTO public.bot_disparo_alvos (disparo_id, telefone, nome)
  SELECT v_disparo, t.telefone, t.nome FROM _alvos t;

  INSERT INTO public.academia_avisos
    (partner_id, student_id, credencial_id, marco, valido_ate, disparo_id, telefone)
  SELECT p_partner_id, t.student_id, t.credencial_id, 'reativacao', t.valido_ate, v_disparo, t.telefone
    FROM _alvos t
  ON CONFLICT DO NOTHING;

  contatos := v_qtd; disparo_id := v_disparo;
  RETURN NEXT;
END; $$;

REVOKE EXECUTE ON FUNCTION public.academia_reativacao_preparar(uuid, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_reativacao_preparar(uuid, integer, integer, integer) TO authenticated, service_role;

-- Quantas pessoas cada faixa alcancaria, para olhar ANTES de montar a campanha.
CREATE OR REPLACE FUNCTION public.academia_reativacao_previa(p_partner_id uuid)
RETURNS TABLE (faixa text, pessoas bigint, com_telefone bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT f.rotulo,
         count(*) FILTER (WHERE a.dias_restantes <= -f.de AND a.dias_restantes >= -f.ate),
         count(*) FILTER (WHERE a.dias_restantes <= -f.de AND a.dias_restantes >= -f.ate
                            AND length(trim(COALESCE(pr.phone, cr.telefone, ''))) >= 8)
    FROM public.acesso_avaliar_academia(p_partner_id) a
    LEFT JOIN public.students s  ON s.id = a.student_id
    LEFT JOIN public.profiles pr ON pr.id = s.profile_id
    LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
   CROSS JOIN (VALUES
      ('parou ha 15 a 30 dias', 15, 30),
      ('parou ha 31 a 90 dias', 31, 90),
      ('parou ha 91 a 180 dias', 91, 180),
      ('parou ha 181 a 365 dias', 181, 365),
      ('parou ha mais de 365 dias', 366, 100000)
   ) f(rotulo, de, ate)
   WHERE public.academia_pode_ver(p_partner_id)
   GROUP BY f.rotulo, f.de ORDER BY f.de;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_reativacao_previa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_reativacao_previa(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Linha de conferencia:
--   SELECT * FROM public.academia_reativacao_previa('<partner>');
--   SELECT marco, count(*) FROM public.academia_avisos_pendentes('<partner>') GROUP BY marco;
