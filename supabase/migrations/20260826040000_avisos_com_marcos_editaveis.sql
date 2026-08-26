-- Os marcos de aviso deixam de ser código e viram dado.
--
-- Eram oito, fixos num CASE dentro de academia_avisos_pendentes: d3, d2, d1,
-- d0, último dia, retorno 7/30/90. Serviam para a Estação por acaso — cada
-- academia tem a sua cadência, e mudar isso exigia migration. Pior: a tela
-- listava só cinco. Os três de retorno existiam no banco, disparavam, e nunca
-- apareceram para ninguém editar.
--
-- Agora cada academia cria, edita, desliga, reordena e apaga os próprios
-- avisos. O que não muda: nada envia sozinho. A campanha nasce em rascunho e
-- alguém aperta o botão, com as proteções de chip da aba Robô.

-- 1) As chaves deixam de ser fechadas.
ALTER TABLE public.academia_avisos_modelos DROP CONSTRAINT IF EXISTS academia_avisos_modelos_marco_check;
ALTER TABLE public.academia_avisos          DROP CONSTRAINT IF EXISTS academia_avisos_marco_check;

-- 2) O modelo passa a carregar QUANDO dispara, não só o texto.
--
-- referencia diz de onde os dias são contados:
--   'vencimento' — o dia em que o plano vence
--   'bloqueio'   — o último dia em que a pessoa ainda entra (vencimento + carência)
--
-- quando é o deslocamento: positivo = antes, negativo = depois.
--   d3         -> vencimento, +3
--   d0         -> vencimento,  0
--   ultimo_dia -> bloqueio,    0
--   retorno_7  -> bloqueio,   -7
--
-- Contar reativação a partir do BLOQUEIO e não do vencimento é deliberado:
-- "faz uma semana que você não entra" precisa ser verdade.
ALTER TABLE public.academia_avisos_modelos
  ADD COLUMN IF NOT EXISTS nome       text,
  ADD COLUMN IF NOT EXISTS referencia text NOT NULL DEFAULT 'vencimento',
  ADD COLUMN IF NOT EXISTS quando     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS posicao    integer NOT NULL DEFAULT 0;

ALTER TABLE public.academia_avisos_modelos DROP CONSTRAINT IF EXISTS academia_aviso_referencia_check;
ALTER TABLE public.academia_avisos_modelos
  ADD CONSTRAINT academia_aviso_referencia_check
  CHECK (referencia IN ('vencimento', 'bloqueio'));

-- 3) Os oito de hoje ganham o horário que já tinham no código.
--
-- Antes do índice único, e não depois: as colunas nasceram com o DEFAULT
-- ('vencimento', 0), então neste ponto os oito estão empatados no mesmo
-- momento. Criar o índice aqui em cima falharia.
UPDATE public.academia_avisos_modelos SET
  nome = COALESCE(nome, CASE marco
           WHEN 'd3'         THEN 'Faltam 3 dias'
           WHEN 'd2'         THEN 'Faltam 2 dias'
           WHEN 'd1'         THEN 'Vence amanhã'
           WHEN 'd0'         THEN 'Vence hoje'
           WHEN 'ultimo_dia' THEN 'Último dia de entrada'
           WHEN 'retorno_7'  THEN 'Sumiu há 1 semana'
           WHEN 'retorno_30' THEN 'Sumiu há 1 mês'
           WHEN 'retorno_90' THEN 'Sumiu há 3 meses'
           ELSE marco END),
  referencia = CASE WHEN marco IN ('d3','d2','d1','d0') THEN 'vencimento' ELSE 'bloqueio' END,
  quando = CASE marco
             WHEN 'd3' THEN 3  WHEN 'd2' THEN 2  WHEN 'd1' THEN 1  WHEN 'd0' THEN 0
             WHEN 'ultimo_dia' THEN 0
             WHEN 'retorno_7'  THEN -7
             WHEN 'retorno_30' THEN -30
             WHEN 'retorno_90' THEN -90
             ELSE 0 END,
  posicao = CASE marco
              WHEN 'd3' THEN 1 WHEN 'd2' THEN 2 WHEN 'd1' THEN 3 WHEN 'd0' THEN 4
              WHEN 'ultimo_dia' THEN 5
              WHEN 'retorno_7'  THEN 6 WHEN 'retorno_30' THEN 7 WHEN 'retorno_90' THEN 8
              ELSE 99 END
WHERE marco IN ('d3','d2','d1','d0','ultimo_dia','retorno_7','retorno_30','retorno_90');

-- Dois avisos no mesmo ponto do tempo seriam duas mensagens iguais.
DROP INDEX IF EXISTS academia_aviso_momento_unico;
CREATE UNIQUE INDEX academia_aviso_momento_unico
  ON public.academia_avisos_modelos (partner_id, referencia, quando);

-- 4) A régua dos avisos passa a ler a tabela, não o CASE.
CREATE OR REPLACE FUNCTION public.academia_avisos_pendentes(p_partner_id uuid)
RETURNS TABLE(
  student_id uuid, credencial_id uuid, nome text, telefone text,
  marco text, dias_restantes integer, valido_ate date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_carencia integer; v_tz text; v_hoje date;
BEGIN
  SELECT COALESCE(c.dias_carencia, 3), COALESCE(c.timezone, 'America/Sao_Paulo')
    INTO v_carencia, v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_carencia := COALESCE(v_carencia, 3);
  v_tz       := COALESCE(v_tz, 'America/Sao_Paulo');
  -- O dia e o da academia, nao o do servidor. Em Cuiaba isso ja custou caro.
  v_hoje     := (now() AT TIME ZONE v_tz)::date;

  RETURN QUERY
  WITH casados AS (
    -- UM aviso por pessoa. Dois marcos podem cair no mesmo dia: 'vencimento -3'
    -- e 'bloqueio 0' com carencia 3 sao a mesma data. A academia pode criar
    -- essa sobreposicao sem perceber, ou cria-la meses depois so mudando a
    -- carencia -- por isso a defesa fica aqui, na hora de disparar, e nao numa
    -- validacao de cadastro. Ganha o marco de menor posicao.
    SELECT DISTINCT ON (COALESCE(a.credencial_id::text, a.student_id::text))
           a.student_id     AS r_student,
           a.credencial_id  AS r_credencial,
           -- Aluno da plataforma tem nome no perfil; aluno so da academia tem o
           -- nome que o proprio leitor conhece.
           COALESCE(pr.name, cr.nome_no_equipamento)::text AS r_nome,
           COALESCE(pr.phone, cr.telefone)::text           AS r_telefone,
           mo.marco         AS r_marco,
           mo.posicao       AS r_posicao,
           a.dias_restantes AS r_dias,
           a.valido_ate     AS r_ate
      FROM public.acesso_avaliar_academia(p_partner_id) a
      LEFT JOIN public.students s   ON s.id = a.student_id
      LEFT JOIN public.profiles pr  ON pr.id = s.profile_id
      LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
      -- O marco casa quando o dia bate exatamente. A conta muda conforme a
      -- referencia: 'vencimento' e o proprio dias_restantes; 'bloqueio' desloca
      -- pela carencia da academia, nunca por um numero fixo.
      JOIN public.academia_avisos_modelos mo
        ON mo.partner_id = p_partner_id
       AND mo.ativo
       AND a.dias_restantes = CASE mo.referencia
             WHEN 'vencimento' THEN mo.quando
             ELSE mo.quando - v_carencia
           END
     WHERE NOT EXISTS (
         SELECT 1 FROM public.academia_avisos e
          WHERE e.partner_id = p_partner_id
            AND COALESCE(e.credencial_id::text, e.student_id::text)
                = COALESCE(a.credencial_id::text, a.student_id::text)
            AND (
                 -- o mesmo marco, no mesmo ciclo, nao se repete
                 (e.valido_ate = a.valido_ate AND e.marco = mo.marco)
                 -- e ninguem leva dois avisos no mesmo dia, seja qual for o marco
                 OR (e.gerado_em AT TIME ZONE v_tz)::date = v_hoje
                )
       )
     ORDER BY COALESCE(a.credencial_id::text, a.student_id::text), mo.posicao
  )
  SELECT r_student, r_credencial, r_nome, r_telefone, r_marco, r_dias, r_ate
    FROM casados
   ORDER BY r_dias DESC, r_nome;
END;
$function$;

-- 5) Academia nova nasce com os oito avisos prontos, não com a tela vazia.
--
-- Antes a lista era sintetizada no TypeScript a cada abertura da tela. Agora a
-- academia tem linhas de verdade, que ela edita e apaga.
--
-- Os textos vêm de academia_aviso_texto_padrao de propósito: uma segunda cópia
-- deles no código seria a que sai de sincronia.
CREATE OR REPLACE FUNCTION public.academia_avisos_semear(p_partner_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_n integer := 0;
BEGIN
  -- So semeia quem nunca teve nenhum. Academia que apagou um aviso de
  -- proposito nao pode ve-lo voltar sozinho na proxima abertura da tela.
  IF EXISTS (SELECT 1 FROM public.academia_avisos_modelos WHERE partner_id = p_partner_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.academia_avisos_modelos
    (partner_id, marco, nome, referencia, quando, posicao, texto, ativo)
  SELECT p_partner_id, d.marco, d.nome, d.referencia, d.quando, d.posicao,
         COALESCE(public.academia_aviso_texto_padrao(d.marco), ''), true
    FROM (VALUES
      ('d3',         'Faltam 3 dias',         'vencimento',   3, 1),
      ('d2',         'Faltam 2 dias',         'vencimento',   2, 2),
      ('d1',         'Vence amanha',          'vencimento',   1, 3),
      ('d0',         'Vence hoje',            'vencimento',   0, 4),
      ('ultimo_dia', 'Ultimo dia de entrada', 'bloqueio',     0, 5),
      ('retorno_7',  'Sumiu ha 1 semana',     'bloqueio',    -7, 6),
      ('retorno_30', 'Sumiu ha 1 mes',        'bloqueio',   -30, 7),
      ('retorno_90', 'Sumiu ha 3 meses',      'bloqueio',   -90, 8)
    ) AS d(marco, nome, referencia, quando, posicao);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;

-- 6) A campanha passa a se chamar pelo nome do aviso, não pela chave interna.
--
-- Com os oito de fábrica dava para conviver: "Aviso de vencimento (d3)" ainda
-- se entende. Com marco personalizado viraria "Aviso de vencimento
-- (m_vencimento_10)" na lista do robô, que é onde alguém decide se dispara ou
-- não. Nome de gente, não de chave.
--
-- De quebra: texto vazio agora estoura em vez de virar mensagem em branco.
CREATE OR REPLACE FUNCTION public.academia_avisos_preparar(p_partner_id uuid)
RETURNS TABLE(marco text, contatos integer, disparo_id uuid)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r RECORD; v_texto text; v_nome text; v_disparo uuid; v_qtd integer;
  v_hoje text := to_char(now(), 'DD/MM/YYYY');
BEGIN
  FOR r IN
    SELECT p.marco, p.valido_ate, count(*)::integer AS qtd
      FROM public.academia_avisos_pendentes(p_partner_id) p
     WHERE length(trim(COALESCE(p.telefone, ''))) >= 8
     GROUP BY p.marco, p.valido_ate
  LOOP
    SELECT mo.texto, mo.nome INTO v_texto, v_nome
      FROM public.academia_avisos_modelos mo
     WHERE mo.partner_id = p_partner_id AND mo.marco = r.marco AND mo.ativo;

    -- NULLIF junto do COALESCE: texto em branco nao e texto. Sem isso um
    -- modelo salvo vazio viraria uma campanha com mensagem em branco, que o
    -- robo dispararia sem reclamar.
    v_texto := COALESCE(NULLIF(trim(v_texto), ''), public.academia_aviso_texto_padrao(r.marco));
    v_nome  := COALESCE(NULLIF(trim(v_nome), ''), r.marco);

    IF v_texto IS NULL OR trim(v_texto) = '' THEN
      RAISE EXCEPTION 'O aviso "%" esta sem texto.', v_nome USING ERRCODE = 'check_violation';
    END IF;

    -- {data} sai aqui porque todo alvo deste marco tem o mesmo vencimento.
    -- {nome} fica para o robo resolver por pessoa no envio.
    v_texto := replace(v_texto, '{data}', to_char(r.valido_ate, 'DD/MM/YYYY'));

    INSERT INTO public.bot_disparos (escopo, owner_id, nome, mensagem, uso, status)
    VALUES ('parceiro', p_partner_id,
            v_nome || ' — ' || v_hoje,
            v_texto, 'plataforma', 'rascunho')
    RETURNING id INTO v_disparo;

    -- Sem ON CONFLICT (disparo_id, telefone): `disparo_id` e ao mesmo tempo
    -- coluna da tabela e parametro de saida desta funcao, e o Postgres recusa
    -- por ambiguidade. A deduplicacao de telefone e feita no DISTINCT ON --
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
END;
$function$;

-- 7) Os textos padrão ganham acento.
--
-- Eles saem por WhatsApp para cliente final, e estavam sem acentuação nenhuma:
-- "voce nao consegue entrar", "e o ultimo dia de acesso". A Estação não sofre
-- com isso porque o Erick já reescreveu os oito textos dela — mas é daqui que
-- toda academia nova copia os seus, agora pela tela de avisos.
--
-- Só o padrão muda. Texto que alguma academia já personalizou fica intacto.
CREATE OR REPLACE FUNCTION public.academia_aviso_texto_padrao(p_marco text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE p_marco
    WHEN 'd3' THEN 'Oi {nome}! Sua mensalidade da academia vence em 3 dias, no dia {data}.'
    WHEN 'd2' THEN 'Oi {nome}! Faltam 2 dias para vencer sua mensalidade da academia ({data}).'
    WHEN 'd1' THEN 'Oi {nome}! Sua mensalidade da academia vence amanhã, {data}.'
    WHEN 'd0' THEN 'Oi {nome}! Sua mensalidade da academia vence hoje ({data}). Renove para continuar treinando.'
    WHEN 'ultimo_dia' THEN 'Oi {nome}! Sua mensalidade venceu em {data} e hoje é o último dia de acesso. Renove hoje para não perder a entrada amanhã.'
    -- Reativação: tom de convite, não de cobrança. Quem parou já sabe que parou.
    WHEN 'retorno_7' THEN 'Oi {nome}! Faz uma semana que você não consegue entrar. Bora voltar? É só renovar na recepção.'
    WHEN 'retorno_30' THEN 'Oi {nome}, tudo bem? Faz um mês que você não treina com a gente. Se quiser voltar, fala comigo que eu ajeito sua volta.'
    WHEN 'retorno_90' THEN 'Oi {nome}! Já faz um tempo. A academia mudou bastante e sua vaga continua aqui. Quer dar uma passada para ver?'
    WHEN 'reativacao' THEN 'Oi {nome}! Senti sua falta nos treinos. Quer voltar? Me chama aqui que eu te explico como está a academia agora.'
    ELSE 'Sua mensalidade da academia precisa de atenção.'
  END;
$function$;

-- E os nomes que a semeadura escreve também.
CREATE OR REPLACE FUNCTION public.academia_avisos_semear(p_partner_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_n integer := 0;
BEGIN
  -- So semeia quem nunca teve nenhum. Academia que apagou um aviso de
  -- proposito nao pode ve-lo voltar sozinho na proxima abertura da tela.
  IF EXISTS (SELECT 1 FROM public.academia_avisos_modelos WHERE partner_id = p_partner_id) THEN
    RETURN 0;
  END IF;

  INSERT INTO public.academia_avisos_modelos
    (partner_id, marco, nome, referencia, quando, posicao, texto, ativo)
  SELECT p_partner_id, d.marco, d.nome, d.referencia, d.quando, d.posicao,
         COALESCE(public.academia_aviso_texto_padrao(d.marco), ''), true
    FROM (VALUES
      ('d3',         'Faltam 3 dias',         'vencimento',   3, 1),
      ('d2',         'Faltam 2 dias',         'vencimento',   2, 2),
      ('d1',         'Vence amanhã',          'vencimento',   1, 3),
      ('d0',         'Vence hoje',            'vencimento',   0, 4),
      ('ultimo_dia', 'Último dia de entrada', 'bloqueio',     0, 5),
      ('retorno_7',  'Sumiu há 1 semana',     'bloqueio',    -7, 6),
      ('retorno_30', 'Sumiu há 1 mês',        'bloqueio',   -30, 7),
      ('retorno_90', 'Sumiu há 3 meses',      'bloqueio',   -90, 8)
    ) AS d(marco, nome, referencia, quando, posicao);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
