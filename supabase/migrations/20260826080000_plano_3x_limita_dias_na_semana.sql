-- Plano de 3x na semana passa a valer 3 DIAS por semana na catraca.
--
-- Até aqui "3x semana" era só o nome do plano e o preço: 53 pessoas pagam por
-- três dias e entravam todos os dias, sem nada barrar. A régua contava
-- vencimento e mais nada.
--
-- A contagem é por DIA, não por passagem. Quem entra, sai para o carro e volta
-- gastou um dia, não dois. A semana começa na segunda e fecha no domingo — que
-- é o que `date_trunc('week')` já faz no Postgres.
--
-- O limite mora na MENSALIDADE, não no plano. A regra viaja com a venda: quem
-- comprou 3x continua com 3x mesmo que a academia edite o plano depois, e o
-- histórico continua explicável. Também evita casar texto livre na hora de
-- decidir acesso — as mensalidades importadas do Next Fit têm nome próprio
-- ("Funcional - Mensal - 3x semana"), diferente do nome dos planos da casa.

ALTER TABLE public.academia_planos
  ADD COLUMN IF NOT EXISTS limite_dias_semana integer;
ALTER TABLE public.academia_mensalidades
  ADD COLUMN IF NOT EXISTS limite_dias_semana integer;

COMMENT ON COLUMN public.academia_mensalidades.limite_dias_semana IS
  'Quantos DIAS por semana esta mensalidade permite entrar. Nulo = sem limite (plano livre).';

ALTER TABLE public.academia_planos DROP CONSTRAINT IF EXISTS academia_plano_limite_check;
ALTER TABLE public.academia_planos
  ADD CONSTRAINT academia_plano_limite_check
  CHECK (limite_dias_semana IS NULL OR (limite_dias_semana >= 1 AND limite_dias_semana <= 7));

ALTER TABLE public.academia_mensalidades DROP CONSTRAINT IF EXISTS academia_mensalidade_limite_check;
ALTER TABLE public.academia_mensalidades
  ADD CONSTRAINT academia_mensalidade_limite_check
  CHECK (limite_dias_semana IS NULL OR (limite_dias_semana >= 1 AND limite_dias_semana <= 7));

-- Backfill pelo nome, uma vez só. Daqui pra frente quem grava é o cadastro.
-- Pega "Funcional - Mensal - 3x semana", "Mensal - 3x semana",
-- "Trimestral - 3x semana" e "FUNCIONAL 3X PROMOCIONAL".
UPDATE public.academia_planos SET limite_dias_semana = 3
 WHERE limite_dias_semana IS NULL AND nome ILIKE '%3x%';

UPDATE public.academia_mensalidades SET limite_dias_semana = 3
 WHERE limite_dias_semana IS NULL AND plano ILIKE '%3x%';

-- O retrato que o agente baixa passa a carregar o limite e o gasto da semana.
--
-- O limite NÃO entra em `acesso_avaliar_academia` de propósito. Aquela função
-- alimenta o CRM e os relatórios: quem bateu a cota da semana está EM DIA, e
-- marcá-lo como bloqueado ali criaria cartão de cobrança para quem não deve
-- nada. São duas perguntas diferentes — "está em dia?" e "pode entrar agora?".
--
-- Muda o tipo de retorno, então precisa de DROP: o Postgres não troca a
-- assinatura com CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.academia_agente_retrato(uuid, text);

CREATE FUNCTION public.academia_agente_retrato(p_agente_id uuid, p_segredo text)
RETURNS TABLE(ref text, ate date, limite integer, usados integer, hoje boolean, dia date)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  a RECORD;
  v_carencia integer;
  v_tz text;
  v_hoje date;
  v_semana date;
BEGIN
  SELECT id, partner_id INTO a
    FROM public.academia_agentes
   WHERE id = p_agente_id
     AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes
     SET ultimo_contato_em = now(), ultima_sync_em = now()
   WHERE id = a.id;

  SELECT COALESCE(c.dias_carencia, 3), COALESCE(c.timezone, 'America/Sao_Paulo')
    INTO v_carencia, v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = a.partner_id;
  v_carencia := COALESCE(v_carencia, 3);
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');

  v_hoje := (now() AT TIME ZONE v_tz)::date;
  -- date_trunc('week') no Postgres comeca na SEGUNDA, que e a semana que a
  -- academia usa. O domingo fecha o ciclo.
  v_semana := date_trunc('week', v_hoje)::date;

  RETURN QUERY
  WITH pessoa AS (
    SELECT cr.referencia,
           cr.id AS cred_id,
           cr.student_id,
           max(m.valido_ate) AS ate,
           -- O limite da mensalidade que MANDA: a de vencimento mais longe, a
           -- mesma que define ate quando a pessoa entra.
           (array_agg(m.limite_dias_semana ORDER BY m.valido_ate DESC))[1] AS limite
      FROM public.academia_credenciais cr
      JOIN public.academia_mensalidades m
        ON m.partner_id = cr.partner_id
       AND m.status = 'ativa'
       AND (
         m.credencial_id = cr.id
         OR (m.credencial_id IS NULL AND cr.student_id IS NOT NULL AND m.student_id = cr.student_id)
       )
     WHERE cr.partner_id = a.partner_id
       AND cr.ativo
     GROUP BY cr.referencia, cr.id, cr.student_id
  )
  SELECT p.referencia,
         (p.ate + v_carencia)::date,
         p.limite,
         COALESCE(u.dias, 0),
         COALESCE(u.hoje, false),
         v_hoje
    FROM pessoa p
    LEFT JOIN LATERAL (
      -- DISTINCT na DATA: entrar, sair para o carro e voltar gasta um dia, nao
      -- dois. E `hoje` existe para quem ja gastou o dia poder entrar de novo no
      -- mesmo dia sem consumir outro.
      SELECT count(DISTINCT (f.entrada_em AT TIME ZONE v_tz)::date)::integer AS dias,
             bool_or((f.entrada_em AT TIME ZONE v_tz)::date = v_hoje) AS hoje
        FROM public.academia_frequencias f
       WHERE f.partner_id = a.partner_id
         AND (f.entrada_em AT TIME ZONE v_tz)::date >= v_semana
         AND (
           f.credencial_id = p.cred_id
           OR (f.credencial_id IS NULL AND p.student_id IS NOT NULL AND f.student_id = p.student_id)
         )
    ) u ON true;
END;
$function$;
