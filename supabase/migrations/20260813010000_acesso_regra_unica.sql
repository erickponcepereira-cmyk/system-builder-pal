-- Elimina a duplicacao da regua de acesso.
--
-- Problema: os limites da regua (D-4, D0, carencia, corte) existiam em dois
-- lugares — na funcao acesso_avaliar e, de novo, em TypeScript dentro de
-- listarAlunosAcademia. Duas copias da mesma regra divergem com o tempo, e o
-- sintoma seria a tela dizer que o aluno esta liberado enquanto a catraca nega.
--
-- Correcao: um unico classificador, usado tanto pela avaliacao individual
-- (caminho da catraca) quanto pela listagem da academia (caminho da tela).

-- 1. A regua, em um lugar so ------------------------------------------------
-- Recebe dias restantes ja calculados e devolve decisao + motivo.
-- p_dias NULL significa que nao existe mensalidade ativa.

CREATE OR REPLACE FUNCTION public.acesso_classificar(p_dias integer, p_carencia integer)
RETURNS TABLE (decisao text, motivo text)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN p_dias IS NULL              THEN 'negado'
      WHEN p_dias >= 4                 THEN 'liberado'
      WHEN p_dias >= 0                 THEN 'liberado'
      WHEN p_dias >= -p_carencia       THEN 'liberado'
      ELSE 'negado'
    END::text,
    CASE
      WHEN p_dias IS NULL              THEN 'sem_mensalidade'
      WHEN p_dias >= 4                 THEN 'contrato_ativo'
      WHEN p_dias >= 0                 THEN 'vencimento_proximo'
      WHEN p_dias >= -p_carencia       THEN 'em_carencia'
      ELSE 'vencido_bloqueado'
    END::text;
$$;

-- 2. Avaliacao individual — caminho quente da catraca ------------------------
-- Mesmo comportamento de antes; a decisao agora vem do classificador.

CREATE OR REPLACE FUNCTION public.acesso_avaliar(p_partner_id uuid, p_student_id uuid)
RETURNS TABLE (decisao text, motivo text, dias_restantes integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
  v_carencia integer;
  v_valido_ate date;
  v_dias integer;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'), COALESCE(c.dias_carencia, 3)
    INTO v_tz, v_carencia
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;

  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_carencia := COALESCE(v_carencia, 3);

  SELECT max(m.valido_ate) INTO v_valido_ate
    FROM public.academia_mensalidades m
   WHERE m.partner_id = p_partner_id
     AND m.student_id = p_student_id
     AND m.status = 'ativa';

  -- NULL - date = NULL, entao sem mensalidade cai no ramo sem_mensalidade.
  v_dias := v_valido_ate - (now() AT TIME ZONE v_tz)::date;

  RETURN QUERY
    SELECT cl.decisao, cl.motivo, v_dias
      FROM public.acesso_classificar(v_dias, v_carencia) cl;
END;
$$;

-- 3. Avaliacao da academia inteira — caminho da tela -------------------------
-- Uma chamada em vez de uma por aluno, e sem reimplementar a regua no cliente.

CREATE OR REPLACE FUNCTION public.acesso_avaliar_academia(p_partner_id uuid)
RETURNS TABLE (student_id uuid, valido_ate date, decisao text, motivo text, dias_restantes integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz text;
  v_carencia integer;
  v_hoje date;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'), COALESCE(c.dias_carencia, 3)
    INTO v_tz, v_carencia
    FROM public.partner_acesso_config c
   WHERE c.partner_id = p_partner_id;

  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_carencia := COALESCE(v_carencia, 3);
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  RETURN QUERY
    SELECT m.student_id,
           m.valido_ate,
           cl.decisao,
           cl.motivo,
           (m.valido_ate - v_hoje)::integer
      FROM (
        SELECT DISTINCT ON (a.student_id) a.student_id, a.valido_ate
          FROM public.academia_mensalidades a
         WHERE a.partner_id = p_partner_id
           AND a.status = 'ativa'
         ORDER BY a.student_id, a.valido_ate DESC
      ) m
      CROSS JOIN LATERAL public.acesso_classificar((m.valido_ate - v_hoje)::integer, v_carencia) cl;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acesso_classificar(integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.acesso_avaliar(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.acesso_avaliar_academia(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.acesso_classificar(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acesso_avaliar(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.acesso_avaliar_academia(uuid) TO authenticated, service_role;
