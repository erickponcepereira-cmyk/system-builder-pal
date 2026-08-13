-- Convivencia entre a automacao e o trabalho humano no CRM.
--
-- Regra do Erick: uma pessoa PODE estar em dois funis ao mesmo tempo — um de
-- negociacao e um de inadimplencia — e a responsabilidade disso e da academia.
-- O sistema so precisa (a) avisar que ela ja esta em outro funil e (b) parar de
-- automatizar quem a equipe ja assumiu.
--
-- "Assumiu" = alguem moveu o cartao que a automacao criou para outra coluna.
-- A partir dai o aluno e tratado no novo lugar e a automacao sai do caminho, em
-- vez de empurrar o cartao de volta toda sincronizacao.

-- O retorno ganhou a coluna 'assumidos'. Postgres nao deixa CREATE OR REPLACE
-- mudar o tipo de retorno de uma funcao que ja existe, entao dropa antes.
DROP FUNCTION IF EXISTS public.academia_crm_sincronizar(uuid);

CREATE OR REPLACE FUNCTION public.academia_crm_sincronizar(p_partner_id uuid)
RETURNS TABLE (gatilho text, criados integer, assumidos integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_criados integer;
  v_assumidos integer;
BEGIN
  FOR r IN
    SELECT g.gatilho, g.quadro_id, g.coluna_id
      FROM public.academia_crm_regras g
     WHERE g.partner_id = p_partner_id AND g.ativo
  LOOP
    -- Quantos ficaram de fora por ja estarem sendo tratados pela equipe.
    SELECT count(*)::integer INTO v_assumidos
      FROM public.acesso_avaliar_academia(p_partner_id) a
     WHERE a.motivo = r.gatilho
       AND EXISTS (
         SELECT 1
           FROM public.academia_crm_cartoes ac
           JOIN public.crm_cartoes cc ON cc.id = ac.cartao_id
          WHERE ac.partner_id = p_partner_id
            AND ac.student_id = a.student_id
            AND cc.arquivado_em IS NULL
            AND cc.coluna_id <> r.coluna_id
       );

    WITH alvos AS (
      SELECT a.student_id, a.valido_ate, pr.name AS nome, pr.phone AS telefone,
             pr.id AS profile_id, a.dias_restantes
        FROM public.acesso_avaliar_academia(p_partner_id) a
        JOIN public.students s  ON s.id = a.student_id
        JOIN public.profiles pr ON pr.id = s.profile_id
       WHERE a.motivo = r.gatilho
         -- ja tem cartao deste gatilho para este vencimento
         AND NOT EXISTS (
           SELECT 1 FROM public.academia_crm_cartoes c
            WHERE c.partner_id = p_partner_id
              AND c.student_id = a.student_id
              AND c.gatilho = r.gatilho
              AND c.referencia = a.valido_ate
         )
         -- a equipe moveu um cartao anterior deste aluno: ela assumiu
         AND NOT EXISTS (
           SELECT 1
             FROM public.academia_crm_cartoes ac
             JOIN public.crm_cartoes cc ON cc.id = ac.cartao_id
            WHERE ac.partner_id = p_partner_id
              AND ac.student_id = a.student_id
              AND cc.arquivado_em IS NULL
              AND cc.coluna_id <> r.coluna_id
         )
    ),
    novos AS (
      INSERT INTO public.crm_cartoes
        (quadro_id, coluna_id, titulo, descricao, profile_id, contato_nome, contato_telefone, prioridade)
      SELECT r.quadro_id, r.coluna_id,
             alvos.nome,
             CASE
               WHEN alvos.dias_restantes >= 0
                 THEN 'Mensalidade vence em ' || alvos.dias_restantes || ' dia(s), em ' || to_char(alvos.valido_ate, 'DD/MM/YYYY') || '.'
               ELSE 'Mensalidade vencida ha ' || abs(alvos.dias_restantes) || ' dia(s), em ' || to_char(alvos.valido_ate, 'DD/MM/YYYY') || '.'
             END,
             alvos.profile_id, alvos.nome, alvos.telefone,
             CASE WHEN r.gatilho = 'vencido_bloqueado' THEN 'alta' ELSE 'normal' END
        FROM alvos
      RETURNING id, profile_id
    )
    INSERT INTO public.academia_crm_cartoes (partner_id, student_id, gatilho, referencia, cartao_id)
    SELECT p_partner_id, alvos.student_id, r.gatilho, alvos.valido_ate, novos.id
      FROM alvos
      JOIN novos ON novos.profile_id = alvos.profile_id
    ON CONFLICT ON CONSTRAINT academia_crm_cartao_unico DO NOTHING;

    GET DIAGNOSTICS v_criados = ROW_COUNT;

    gatilho := r.gatilho;
    criados := v_criados;
    assumidos := COALESCE(v_assumidos, 0);
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Quem esta aberto em mais de um funil ao mesmo tempo. Nao e erro: e informacao
-- para a academia decidir. A automacao nao mexe nesses cartoes.

CREATE OR REPLACE FUNCTION public.academia_crm_em_varios_funis(p_partner_id uuid)
RETURNS TABLE (nome text, funis integer, quadros text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT pr.name::text,
         count(DISTINCT q.id)::integer,
         string_agg(DISTINCT q.nome, ', ')::text
    FROM public.crm_cartoes cc
    JOIN public.crm_quadros q  ON q.id = cc.quadro_id
    JOIN public.profiles    pr ON pr.id = cc.profile_id
   WHERE q.escopo = 'parceiro'
     AND q.owner_id = p_partner_id
     AND cc.arquivado_em IS NULL
     AND q.arquivado_em IS NULL
   GROUP BY pr.id, pr.name
  HAVING count(DISTINCT q.id) > 1
   ORDER BY count(DISTINCT q.id) DESC, pr.name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_crm_sincronizar(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_crm_em_varios_funis(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.academia_crm_sincronizar(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_crm_em_varios_funis(uuid) TO authenticated, service_role;
