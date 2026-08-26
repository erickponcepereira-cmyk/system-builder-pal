-- Os números do relatório passam a ter nome.
--
-- `academia_relatorio` devolve só contagens. "274 bloqueados" não dá para
-- trabalhar: a recepção precisa saber QUEM são para ligar, cobrar ou renovar.
-- Esta função é o outro lado do mesmo número — mesma régua, mesmo período.
--
-- Nome e telefone saem do perfil quando a pessoa é aluno da plataforma, e da
-- credencial do leitor quando ela só existe lá. É a quinta vez que essa
-- bifurcação aparece; sempre que uma consulta nova esquecer dela, ela devolve
-- 400 linhas em branco.

CREATE OR REPLACE FUNCTION public.academia_relatorio_pessoas(
  p_partner_id uuid,
  p_categoria  text,
  p_de         date DEFAULT NULL,
  p_ate        date DEFAULT NULL
)
RETURNS TABLE(
  nome         text,
  telefone     text,
  referencia   text,
  student_id   uuid,
  credencial_id uuid,
  valido_ate   date,
  dias         integer,
  detalhe      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz   text;
  v_hoje date;
  v_de   date;
  v_ate  date;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz   := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_de   := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate  := COALESCE(p_ate, v_hoje);

  -- Quem entra hoje, pelas quatro situações da régua. Vem de
  -- acesso_avaliar_academia para a lista nunca discordar do número.
  IF p_categoria IN ('liberados', 'a_vencer', 'em_carencia', 'bloqueados', 'vencem_em_7') THEN
    RETURN QUERY
    SELECT COALESCE(pr.name, cr.nome_no_equipamento, 'Aluno da academia')::text,
           COALESCE(pr.phone, cr.telefone)::text,
           cr.referencia::text,
           a.student_id,
           a.credencial_id,
           a.valido_ate,
           a.dias_restantes,
           CASE
             WHEN a.dias_restantes >= 0 THEN 'vence em ' || a.dias_restantes || ' dia(s)'
             ELSE 'vencido há ' || abs(a.dias_restantes) || ' dia(s)'
           END
      FROM public.acesso_avaliar_academia(p_partner_id) a
      LEFT JOIN public.students s  ON s.id  = a.student_id
      LEFT JOIN public.profiles pr ON pr.id = s.profile_id
      LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
     WHERE CASE p_categoria
             WHEN 'liberados'   THEN a.decisao = 'liberado'
             WHEN 'a_vencer'    THEN a.motivo  = 'vencimento_proximo'
             WHEN 'em_carencia' THEN a.motivo  = 'em_carencia'
             WHEN 'bloqueados'  THEN a.motivo  = 'vencido_bloqueado'
             WHEN 'vencem_em_7' THEN a.dias_restantes BETWEEN 0 AND 7
             ELSE false
           END
     ORDER BY a.valido_ate;

  -- Quem está no leitor e não tem mensalidade nenhuma. Não aparece na régua,
  -- justamente porque a régua parte da mensalidade.
  ELSIF p_categoria = 'sem_mensalidade' THEN
    RETURN QUERY
    SELECT COALESCE(cr.nome_no_equipamento, 'Sem nome no leitor')::text,
           cr.telefone::text,
           cr.referencia::text,
           cr.student_id,
           cr.id,
           NULL::date,
           NULL::integer,
           CASE WHEN cr.importado_em IS NULL
                THEN 'cadastrada na recepção, ainda sem rosto no leitor'
                ELSE 'no leitor, sem mensalidade lançada' END
      FROM public.academia_credenciais cr
     WHERE cr.partner_id = p_partner_id AND cr.ativo
       AND NOT EXISTS (
         SELECT 1 FROM public.academia_mensalidades m
          WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
            AND (m.credencial_id = cr.id
              OR (m.credencial_id IS NULL AND cr.student_id IS NOT NULL AND m.student_id = cr.student_id))
       )
     ORDER BY cr.nome_no_equipamento;

  -- Movimento da catraca no período.
  ELSIF p_categoria IN ('entradas', 'manuais') THEN
    RETURN QUERY
    SELECT COALESCE(pr.name, cr.nome_no_equipamento, 'Aluno da academia')::text,
           COALESCE(pr.phone, cr.telefone)::text,
           cr.referencia::text,
           f.student_id,
           f.credencial_id,
           NULL::date,
           NULL::integer,
           to_char(f.entrada_em AT TIME ZONE v_tz, 'DD/MM HH24:MI') || ' · ' || f.origem
      FROM public.academia_frequencias f
      LEFT JOIN public.students s  ON s.id  = f.student_id
      LEFT JOIN public.profiles pr ON pr.id = s.profile_id
      LEFT JOIN public.academia_credenciais cr ON cr.id = f.credencial_id
     WHERE f.partner_id = p_partner_id
       AND (f.entrada_em AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
       AND (p_categoria = 'entradas' OR f.origem = 'manual')
     ORDER BY f.entrada_em DESC;

  ELSIF p_categoria = 'barradas' THEN
    RETURN QUERY
    SELECT COALESCE(cr.nome_no_equipamento, 'Não identificado')::text,
           cr.telefone::text,
           n.referencia::text,
           n.student_id,
           cr.id,
           NULL::date,
           NULL::integer,
           to_char(n.tentado_em AT TIME ZONE v_tz, 'DD/MM HH24:MI') || ' · ' || n.motivo
             || COALESCE(' · ' || n.detalhe, '')
      FROM public.academia_acessos_negados n
      LEFT JOIN public.academia_credenciais cr
             ON cr.partner_id = n.partner_id AND cr.referencia = n.referencia
     WHERE n.partner_id = p_partner_id
       AND (n.tentado_em AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
     ORDER BY n.tentado_em DESC;
  END IF;
END;
$function$;
