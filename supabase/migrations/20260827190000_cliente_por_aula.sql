-- Cliente por aula, sem pedir nada novo à catraca.
--
-- `academia_frequencias.turma_id` existe e está NULL nas 95 passagens: o agente
-- não sabe qual aula está acontecendo, e ensinar isso a ele significaria
-- publicar versão nova toda vez que a academia mudasse um horário.
--
-- A aula sai do RELÓGIO. Cada turma tem dia da semana e janela de horário; a
-- passagem cai na turma cuja janela a contém. Isso classifica retroativamente
-- tudo que já foi coletado — a academia cadastra a grade hoje e vê os 95
-- registros de ontem distribuídos — e continua certo se alguém mudar o horário.
--
-- Quem não cai em nenhuma janela aparece como "Fora de aula", que não é sobra:
-- é justamente o número que mostra se a grade cadastrada bate com a realidade.

COMMENT ON COLUMN public.academia_turmas.dia_semana IS
  'Dia da semana no padrão do Postgres EXTRACT(DOW): 0=domingo … 6=sábado. NULL = todos os dias.';

CREATE OR REPLACE FUNCTION public.academia_relatorio_turmas(
  p_partner_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL
)
RETURNS TABLE(
  turma_id uuid,
  turma text,
  modalidade text,
  dia_semana smallint,
  janela text,
  entradas integer,
  pessoas integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz text;
  v_hoje date;
  v_de date;
  v_ate date;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_de := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate := COALESCE(p_ate, v_hoje);

  RETURN QUERY
  WITH passagem AS (
    SELECT f.id,
           COALESCE(f.credencial_id::text, f.student_id::text) AS quem,
           (f.entrada_em AT TIME ZONE v_tz) AS local_ts
      FROM public.academia_frequencias f
     WHERE f.partner_id = p_partner_id
       AND (f.entrada_em AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
  ),
  -- Uma passagem pode caber em duas turmas sobrepostas. Fica com a que começa
  -- mais tarde: quem entra 06:58 numa aula de 06:00 e outra de 07:00 veio para
  -- a das 07:00.
  classificada AS (
    SELECT p.id, p.quem,
           (SELECT t.id FROM public.academia_turmas t
             WHERE t.partner_id = p_partner_id AND t.ativo
               AND t.hora_inicio IS NOT NULL AND t.hora_fim IS NOT NULL
               AND (t.dia_semana IS NULL
                 OR t.dia_semana = EXTRACT(DOW FROM p.local_ts)::smallint)
               AND p.local_ts::time >= t.hora_inicio
               AND p.local_ts::time <  t.hora_fim
             ORDER BY t.hora_inicio DESC
             LIMIT 1) AS turma
      FROM passagem p
  )
  SELECT t.id, t.nome, t.modalidade, t.dia_semana,
         to_char(t.hora_inicio, 'HH24:MI') || '–' || to_char(t.hora_fim, 'HH24:MI'),
         count(c.id)::integer, count(DISTINCT c.quem)::integer
    FROM public.academia_turmas t
    LEFT JOIN classificada c ON c.turma = t.id
   WHERE t.partner_id = p_partner_id AND t.ativo
     AND t.hora_inicio IS NOT NULL AND t.hora_fim IS NOT NULL
   GROUP BY t.id, t.nome, t.modalidade, t.dia_semana, t.hora_inicio, t.hora_fim

  UNION ALL

  -- A linha que mede a propria grade: se ela for a maior de todas, o que esta
  -- cadastrado nao descreve o que acontece na academia.
  SELECT NULL::uuid, 'Fora de aula'::text, NULL::text, NULL::smallint, '—'::text,
         count(*)::integer, count(DISTINCT c.quem)::integer
    FROM classificada c WHERE c.turma IS NULL
   HAVING count(*) > 0;
END;
$function$;

-- E a lista de eventos do período.
--
-- Evento não é pessoa, então não entra em `academia_relatorio_pessoas_extra`:
-- uma linha aqui é o evento inteiro, com quantos se inscreveram e quanto
-- entrou. Zero eventos cadastrados hoje — a tela precisa existir antes de ter
-- o que mostrar, senão a academia nunca cadastra o primeiro.
CREATE OR REPLACE FUNCTION public.academia_relatorio_eventos(
  p_partner_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL
)
RETURNS TABLE(
  evento_id uuid,
  nome text,
  data_evento date,
  hora_inicio time,
  valor numeric,
  inscritos integer,
  compareceram integer,
  bruto numeric,
  liquido numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz text;
  v_hoje date;
  v_de date;
  v_ate date;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_de := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate := COALESCE(p_ate, v_hoje);

  RETURN QUERY
  SELECT e.id, e.nome, e.data_evento, e.hora_inicio, e.valor,
         count(i.id)::integer,
         -- `usado_em` e o carimbo da catraca. A diferenca entre inscrito e
         -- compareceu e o unico numero que diz se o evento deu certo.
         count(i.usado_em)::integer,
         COALESCE(sum(i.valor), 0),
         COALESCE(sum(i.valor_liquido), 0)
    FROM public.academia_eventos e
    LEFT JOIN public.academia_evento_inscricoes i ON i.evento_id = e.id
   WHERE e.partner_id = p_partner_id
     AND e.data_evento BETWEEN v_de AND v_ate
   GROUP BY e.id, e.nome, e.data_evento, e.hora_inicio, e.valor
   ORDER BY e.data_evento DESC, e.hora_inicio;
END;
$function$;
