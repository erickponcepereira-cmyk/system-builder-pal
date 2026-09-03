-- O funil anda sozinho, e quem paga sai dele mesmo tendo sido movido.
--
-- Dois defeitos do mesmo desenho, provados em transacao antes de mexer:
--
-- 1. TODO MUNDO BLOQUEADO CAIA NUMA COLUNA SO. academia_crm_sincronizar casava
--    gatilho = motivo de acesso_avaliar_academia, e os motivos sao cinco. Quem
--    venceu ha 2 dias e quem venceu ha 200 tem o MESMO motivo, entao as etapas
--    de 7, 30, 60 e 90 dias nao tinham como existir.
--
-- 2. QUEM PAGAVA SO VOLTAVA SE NINGUEM TIVESSE MEXIDO NO CARTAO. O passo que
--    arquiva exigia `cc.coluna_id = r.coluna_id`, a coluna EXATA da regra.
--    Cartao movido para "60 dias" e pessoa pagando: o cartao ficava preso no
--    funil para sempre. Medido antes de corrigir: das duas pessoas que pagaram,
--    so voltou a que ninguem tinha movido.
--
-- O segundo defeito e consequencia do primeiro. Assim que as colunas passam a
-- andar, todo cartao sai da coluna de origem -- sem esta correcao, NENHUM
-- pagamento resolveria cartao nenhum.
--
-- As faixas viram DADO, nao codigo: dias_min e dias_max em academia_crm_regras,
-- contados a partir do ULTIMO DIA DE ENTRADA (vencimento + carencia). Mudar a
-- cadencia de uma academia passa a ser um UPDATE, nao uma migration.
--
-- Regra com faixa nula continua se comportando como antes, entao a Estacao, que
-- tem quatro regras sem faixa, nao muda em nada.

ALTER TABLE public.academia_crm_regras
  ADD COLUMN IF NOT EXISTS dias_min integer,
  ADD COLUMN IF NOT EXISTS dias_max integer;

COMMENT ON COLUMN public.academia_crm_regras.dias_min IS
  'Dias passados do ultimo dia de entrada (vencimento + carencia), inclusivo. NULL = sem piso.';
COMMENT ON COLUMN public.academia_crm_regras.dias_max IS
  'Idem, exclusivo. NULL = sem teto, e a faixa terminal do funil.';

-- A unicidade era (partner_id, gatilho), o que proibia duas faixas do mesmo
-- gatilho. NULLS NOT DISTINCT porque duas regras sem faixa continuam sendo
-- duplicata: sem isso o Postgres trataria cada NULL como valor unico e deixaria
-- passar.
ALTER TABLE public.academia_crm_regras DROP CONSTRAINT IF EXISTS academia_crm_regra_unica;
ALTER TABLE public.academia_crm_regras
  ADD CONSTRAINT academia_crm_regra_unica UNIQUE NULLS NOT DISTINCT (partner_id, gatilho, dias_min);

-- Quem se encaixa numa regra hoje. Existe separada porque a sincronizacao
-- precisa da mesma resposta em tres momentos -- mover, contar assumidos e criar
-- -- e repetir o predicado nos tres seria a terceira copia da mesma regua.
CREATE OR REPLACE FUNCTION public.academia_crm_encaixa(
  p_partner_id uuid, p_gatilho text, p_dias_min integer, p_dias_max integer, p_carencia integer
)
 RETURNS TABLE(student_id uuid, credencial_id uuid, valido_ate date, dias_restantes integer)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT a.student_id, a.credencial_id, a.valido_ate, a.dias_restantes
    FROM public.acesso_avaliar_academia(p_partner_id) a
   WHERE a.motivo = p_gatilho
     AND (p_dias_min IS NULL OR (-a.dias_restantes - p_carencia) >= p_dias_min)
     AND (p_dias_max IS NULL OR (-a.dias_restantes - p_carencia) <  p_dias_max);
$function$;

CREATE OR REPLACE FUNCTION public.academia_crm_sincronizar(p_partner_id uuid)
 RETURNS TABLE(gatilho text, criados integer, assumidos integer, arquivados integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  alvo RECORD;
  v_cartao uuid;
  v_criados integer;
  v_assumidos integer;
  v_arquivados integer;
  v_movidos integer;
  v_carencia integer;
BEGIN
  -- A carencia decide onde comeca a contagem: o ultimo dia de entrada e o
  -- vencimento mais ela, e e desse marco que as faixas falam.
  SELECT COALESCE(c.dias_carencia, 3) INTO v_carencia
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_carencia := COALESCE(v_carencia, 3);

  FOR r IN
    SELECT g.gatilho, g.quadro_id, g.coluna_id, g.dias_min, g.dias_max
      FROM public.academia_crm_regras g
     WHERE g.partner_id = p_partner_id AND g.ativo
     ORDER BY g.dias_min NULLS FIRST
  LOOP
    -- 1) Arquiva quem nao se encaixa mais em NENHUMA regra desta academia.
    --
    -- A versao antiga olhava so a coluna desta regra, e por isso um cartao que
    -- tivesse andado nunca era resolvido quando a pessoa pagava. Agora vale
    -- qualquer coluna governada pela automacao. Coluna fora dela ("Renovou", ou
    -- uma que a academia criou) continua sendo da equipe: pagamento nao fecha
    -- conversa que alguem ja comecou.
    WITH governadas AS (
      SELECT g.coluna_id FROM public.academia_crm_regras g
       WHERE g.partner_id = p_partner_id AND g.ativo
    ),
    resolvidos AS (
      SELECT cc.id
        FROM public.academia_crm_cartoes ac
        JOIN public.crm_cartoes cc ON cc.id = ac.cartao_id
       WHERE ac.partner_id = p_partner_id
         AND ac.gatilho = r.gatilho
         AND cc.coluna_id IN (SELECT coluna_id FROM governadas)
         AND cc.arquivado_em IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM public.acesso_avaliar_academia(p_partner_id) a
            WHERE COALESCE(a.credencial_id, a.student_id)
                  = COALESCE(ac.credencial_id, ac.student_id)
              AND a.motivo = r.gatilho
              AND a.valido_ate = ac.referencia
         )
    )
    UPDATE public.crm_cartoes cc
       SET arquivado_em = now()
      FROM resolvidos
     WHERE cc.id = resolvidos.id;

    GET DIAGNOSTICS v_arquivados = ROW_COUNT;

    -- 2) Move para esta coluna quem ja tem cartao e mudou de faixa.
    --
    -- E o que faz o funil andar sem a recepcao: passados 7 dias, o cartao sai de
    -- "2 dias sem acesso" e entra em "Chamando de volta" sozinho. So mexe em
    -- cartao que esta numa coluna da automacao.
    WITH governadas AS (
      SELECT g.coluna_id FROM public.academia_crm_regras g
       WHERE g.partner_id = p_partner_id AND g.ativo
    ),
    mover AS (
      SELECT cc.id
        FROM public.academia_crm_encaixa(p_partner_id, r.gatilho, r.dias_min, r.dias_max, v_carencia) e
        JOIN public.academia_crm_cartoes ac
          ON ac.partner_id = p_partner_id
         AND COALESCE(ac.credencial_id, ac.student_id) = COALESCE(e.credencial_id, e.student_id)
         AND ac.gatilho = r.gatilho
         AND ac.referencia = e.valido_ate
        JOIN public.crm_cartoes cc ON cc.id = ac.cartao_id
       WHERE cc.arquivado_em IS NULL
         AND cc.coluna_id <> r.coluna_id
         AND cc.coluna_id IN (SELECT coluna_id FROM governadas)
    )
    UPDATE public.crm_cartoes cc
       SET coluna_id = r.coluna_id, updated_at = now()
      FROM mover
     WHERE cc.id = mover.id;

    GET DIAGNOSTICS v_movidos = ROW_COUNT;

    -- 3) Quantos ficaram de fora por estarem numa coluna que a automacao nao
    -- governa: alguem da equipe assumiu.
    SELECT count(*)::integer INTO v_assumidos
      FROM public.academia_crm_encaixa(p_partner_id, r.gatilho, r.dias_min, r.dias_max, v_carencia) e
     WHERE EXISTS (
       SELECT 1
         FROM public.academia_crm_cartoes ac
         JOIN public.crm_cartoes cc ON cc.id = ac.cartao_id
        WHERE ac.partner_id = p_partner_id
          AND COALESCE(ac.credencial_id, ac.student_id) = COALESCE(e.credencial_id, e.student_id)
          AND cc.arquivado_em IS NULL
          AND cc.coluna_id NOT IN (
            SELECT g.coluna_id FROM public.academia_crm_regras g
             WHERE g.partner_id = p_partner_id AND g.ativo
          )
     );

    v_criados := 0;

    -- 4) Cria o que falta, um cartao por pessoa. Quem ja tem cartao aberto nao
    -- ganha outro: mover e trabalho do passo 2.
    FOR alvo IN
      SELECT e.student_id,
             e.credencial_id,
             e.valido_ate,
             e.dias_restantes,
             COALESCE(pr.name, cr.nome_no_equipamento, 'Aluno da academia') AS nome,
             COALESCE(pr.phone, cr.telefone)                                AS telefone,
             pr.id AS profile_id
        FROM public.academia_crm_encaixa(p_partner_id, r.gatilho, r.dias_min, r.dias_max, v_carencia) e
        LEFT JOIN public.students s          ON s.id  = e.student_id
        LEFT JOIN public.profiles pr         ON pr.id = s.profile_id
        LEFT JOIN public.academia_credenciais cr ON cr.id = e.credencial_id
       WHERE NOT EXISTS (
           SELECT 1 FROM public.academia_crm_cartoes c
            WHERE c.partner_id = p_partner_id
              AND COALESCE(c.credencial_id, c.student_id)
                  = COALESCE(e.credencial_id, e.student_id)
              AND c.gatilho = r.gatilho
              AND c.referencia = e.valido_ate
         )
         AND NOT EXISTS (
           SELECT 1
             FROM public.academia_crm_cartoes ac
             JOIN public.crm_cartoes cc ON cc.id = ac.cartao_id
            WHERE ac.partner_id = p_partner_id
              AND COALESCE(ac.credencial_id, ac.student_id)
                  = COALESCE(e.credencial_id, e.student_id)
              AND cc.arquivado_em IS NULL
         )
    LOOP
      INSERT INTO public.crm_cartoes
        (quadro_id, coluna_id, titulo, descricao, profile_id, contato_nome, contato_telefone, prioridade)
      VALUES (r.quadro_id, r.coluna_id,
              alvo.nome,
              CASE
                WHEN alvo.dias_restantes >= 0
                  THEN 'Mensalidade vence em ' || alvo.dias_restantes || ' dia(s), em ' || to_char(alvo.valido_ate, 'DD/MM/YYYY') || '.'
                ELSE 'Mensalidade vencida ha ' || abs(alvo.dias_restantes) || ' dia(s), em ' || to_char(alvo.valido_ate, 'DD/MM/YYYY') || '.'
              END,
              alvo.profile_id, alvo.nome, alvo.telefone,
              CASE WHEN r.gatilho = 'vencido_bloqueado' THEN 'alta' ELSE 'normal' END)
      RETURNING id INTO v_cartao;

      INSERT INTO public.academia_crm_cartoes
        (partner_id, student_id, credencial_id, gatilho, referencia, cartao_id)
      VALUES (p_partner_id, alvo.student_id, alvo.credencial_id, r.gatilho, alvo.valido_ate, v_cartao)
      ON CONFLICT DO NOTHING;

      IF FOUND THEN
        v_criados := v_criados + 1;
      ELSE
        DELETE FROM public.crm_cartoes WHERE id = v_cartao;
      END IF;
    END LOOP;

    gatilho := r.gatilho;
    criados := v_criados;
    assumidos := COALESCE(v_assumidos, 0);
    -- Arquivado e movido somam no mesmo numero: os dois sao "a automacao mexeu
    -- neste cartao", que e o que a tela reporta.
    arquivados := COALESCE(v_arquivados, 0) + COALESCE(v_movidos, 0);
    RETURN NEXT;
  END LOOP;
END;
$function$;
