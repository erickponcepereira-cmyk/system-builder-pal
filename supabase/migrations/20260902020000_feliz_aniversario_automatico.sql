-- Feliz aniversario, automatico, nas duas academias.
--
-- O aniversario e um eixo novo: os avisos existentes contam dias a partir do
-- vencimento ou do bloqueio, e aniversario nao tem nada a ver com mensalidade.
-- Entra como uma terceira `referencia` em academia_avisos_modelos e como uma
-- segunda fonte dentro de academia_avisos_pendentes -- o resto do encanamento
-- (montar campanha, deduplicar telefone, marcar enviado) e generico e nao muda.
--
-- QUEM RECEBE: toda credencial ativa da academia, pagando ou nao. Cobranca tem
-- regra de `dias_sumido` para nao mandar "seu plano venceu" a quem ja foi
-- embora, mas parabens nao e cobranca -- e justamente para quem sumiu que ele
-- tem mais chance de trazer de volta.
--
-- POSICAO 0: parabens ganha de cobranca no mesmo dia. `pendentes` ja garante um
-- aviso por pessoa por dia e desempata pela menor posicao, entao basta nascer
-- abaixo de todo mundo. Mandar "sua mensalidade vence" no aniversario da pessoa
-- e pior do que atrasar a cobranca em um dia.
--
-- A data de nascimento sai da credencial OU do perfil. Hoje a cobertura e
-- pequena -- 8 das 417 na Estacao, 0 das 83 no Reino -- porque quase todo mundo
-- veio de importacao. Ela cresce conforme a recepcao edita os cadastros.

-- Sao dois nomes possiveis: a tabela nasceu com `academia_aviso_referencia_check`
-- e ganhou depois o nome no padrao do Postgres. Derrubar so um deixa o outro
-- barrando 'aniversario' -- foi exatamente o que aconteceu na primeira tentativa.
ALTER TABLE public.academia_avisos_modelos
  DROP CONSTRAINT IF EXISTS academia_aviso_referencia_check;
ALTER TABLE public.academia_avisos_modelos
  DROP CONSTRAINT IF EXISTS academia_avisos_modelos_referencia_check;
ALTER TABLE public.academia_avisos_modelos
  ADD CONSTRAINT academia_avisos_modelos_referencia_check
  CHECK (referencia = ANY (ARRAY['vencimento'::text, 'bloqueio'::text, 'aniversario'::text]));

-- O aniversario no ano corrente. Existe para resolver 29/02 num lugar so: em
-- ano comum a pessoa faz aniversario em 28/02, e sem isto ela simplesmente
-- nunca receberia parabens.
CREATE OR REPLACE FUNCTION public.academia_aniversario_no_ano(p_nascimento date, p_ano integer)
 RETURNS date
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_nascimento IS NULL THEN NULL
    WHEN extract(month from p_nascimento) = 2 AND extract(day from p_nascimento) = 29
     AND NOT (p_ano % 4 = 0 AND (p_ano % 100 <> 0 OR p_ano % 400 = 0))
      THEN make_date(p_ano, 2, 28)
    ELSE make_date(p_ano, extract(month from p_nascimento)::int, extract(day from p_nascimento)::int)
  END;
$function$;

CREATE OR REPLACE FUNCTION public.academia_avisos_pendentes(p_partner_id uuid)
 RETURNS TABLE(student_id uuid, credencial_id uuid, nome text, telefone text, marco text, dias_restantes integer, valido_ate date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_carencia integer; v_tz text; v_hoje date; v_sumido integer;
BEGIN
  SELECT COALESCE(c.dias_carencia, 3), COALESCE(c.timezone, 'America/Sao_Paulo'),
         COALESCE(c.dias_sumido, 60)
    INTO v_carencia, v_tz, v_sumido
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_sumido := COALESCE(v_sumido, 60);
  v_carencia := COALESCE(v_carencia, 3);
  v_tz       := COALESCE(v_tz, 'America/Sao_Paulo');
  -- O dia e o da academia, nao o do servidor. Em Cuiaba isso ja custou caro.
  v_hoje     := (now() AT TIME ZONE v_tz)::date;

  RETURN QUERY
  WITH candidatos AS (
    -- Fonte 1: os avisos de mensalidade, contados do vencimento ou do bloqueio.
    SELECT a.student_id     AS r_student,
           a.credencial_id  AS r_credencial,
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
       AND mo.referencia IN ('vencimento', 'bloqueio')
       -- Quem venceu ha mais de `dias_sumido` nao recebe cobranca de
       -- vencimento: para essa pessoa a mensagem chega como se a academia nao
       -- soubesse que ela foi embora. O caminho dela e campanha de retorno, que
       -- tem marco proprio.
       AND a.dias_restantes >= -v_sumido
       AND a.dias_restantes = CASE mo.referencia
             WHEN 'vencimento' THEN mo.quando
             ELSE mo.quando - v_carencia
           END

    UNION ALL

    -- Fonte 2: aniversario. Sai da credencial ativa e nao da regua de acesso --
    -- quem esta devendo tambem faz aniversario, e `valido_ate` aqui e a data do
    -- aniversario deste ano, o que faz a deduplicacao valer por ano.
    SELECT cr.student_id,
           cr.id,
           COALESCE(pr.name, cr.nome_no_equipamento)::text,
           COALESCE(pr.phone, cr.telefone)::text,
           mo.marco,
           mo.posicao,
           0,
           public.academia_aniversario_no_ano(COALESCE(cr.nascimento, pr.birthdate), extract(year from v_hoje)::int)
      FROM public.academia_credenciais cr
      LEFT JOIN public.students s   ON s.id = cr.student_id
      LEFT JOIN public.profiles pr  ON pr.id = s.profile_id
      JOIN public.academia_avisos_modelos mo
        ON mo.partner_id = p_partner_id AND mo.ativo AND mo.referencia = 'aniversario'
     WHERE cr.partner_id = p_partner_id
       AND cr.ativo
       AND public.academia_aniversario_no_ano(COALESCE(cr.nascimento, pr.birthdate), extract(year from v_hoje)::int) = v_hoje
  ),
  casados AS (
    -- UM aviso por pessoa. Dois marcos podem cair no mesmo dia: 'vencimento -3'
    -- e 'bloqueio 0' com carencia 3 sao a mesma data, e agora o aniversario
    -- tambem pode cair junto. A academia pode criar essa sobreposicao sem
    -- perceber, ou cria-la meses depois so mudando a carencia -- por isso a
    -- defesa fica aqui, na hora de disparar, e nao numa validacao de cadastro.
    -- Ganha o marco de menor posicao, e por isso o aniversario nasce em 0.
    SELECT DISTINCT ON (COALESCE(c.r_credencial::text, c.r_student::text)) c.*
      FROM candidatos c
     WHERE NOT EXISTS (
         SELECT 1 FROM public.academia_avisos e
          LEFT JOIN public.bot_disparos d ON d.id = e.disparo_id
          WHERE e.partner_id = p_partner_id
            AND COALESCE(e.credencial_id::text, e.student_id::text)
                = COALESCE(c.r_credencial::text, c.r_student::text)
            AND (
                 -- Ja recebeu: o mesmo marco no mesmo ciclo nao se repete, e
                 -- ninguem leva dois avisos no mesmo dia, seja qual for o marco.
                 (e.enviado_em IS NOT NULL
                  AND ((e.valido_ate = c.r_ate AND e.marco = c.r_marco)
                    OR (e.enviado_em AT TIME ZONE v_tz)::date = v_hoje))
                 -- Ainda nao recebeu, mas ja esta numa campanha viva: esperar,
                 -- nao duplicar. Campanha morta nao prende ninguem.
                 OR (e.enviado_em IS NULL
                     AND d.status IN ('rascunho','enfileirando','enviando'))
                )
       )
     ORDER BY COALESCE(c.r_credencial::text, c.r_student::text), c.r_posicao
  )
  SELECT r_student, r_credencial, r_nome, r_telefone, r_marco, r_dias, r_ate
    FROM casados
   ORDER BY r_dias DESC, r_nome;
END;
$function$;
