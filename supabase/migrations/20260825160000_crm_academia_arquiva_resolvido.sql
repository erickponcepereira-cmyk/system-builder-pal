-- O CRM da academia passa a arquivar o cartão de quem resolveu.
--
-- academia_crm_sincronizar só criava. Quem renovava continuava com o cartão em
-- "Bloqueado" para sempre, e a recepção ligaria cobrando quem já tinha pagado.
-- Apareceu na primeira carga de contratos depois da automação ligar: 17 pessoas
-- saíram de bloqueado no mesmo dia, e nenhum cartão se mexeu.
--
-- A regra de arquivamento respeita a mesma fronteira do resto: a automação só
-- mexe no que ainda está na coluna dela. Cartão que a equipe moveu é da equipe,
-- e continua lá mesmo que a pessoa renove — quem abriu a conversa fecha.

-- O retorno ganhou uma coluna, e o Postgres não troca assinatura em REPLACE.
DROP FUNCTION IF EXISTS public.academia_crm_sincronizar(uuid);

CREATE FUNCTION public.academia_crm_sincronizar(p_partner_id uuid)
RETURNS TABLE(gatilho text, criados integer, assumidos integer, arquivados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r RECORD;
  alvo RECORD;
  v_cartao uuid;
  v_criados integer;
  v_assumidos integer;
  v_arquivados integer;
BEGIN
  FOR r IN
    SELECT g.gatilho, g.quadro_id, g.coluna_id
      FROM public.academia_crm_regras g
     WHERE g.partner_id = p_partner_id AND g.ativo
  LOOP
    -- 1) Arquiva quem não se encaixa mais neste gatilho.
    --
    -- Só cartões que ainda estão na coluna da automação. Se a equipe moveu, o
    -- cartão é dela: renovação não fecha conversa que alguém já começou.
    WITH resolvidos AS (
      SELECT cc.id
        FROM public.academia_crm_cartoes ac
        JOIN public.crm_cartoes cc ON cc.id = ac.cartao_id
       WHERE ac.partner_id = p_partner_id
         AND ac.gatilho = r.gatilho
         AND cc.coluna_id = r.coluna_id
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

    -- 2) Quantos ficaram de fora por já estarem sendo tratados pela equipe.
    SELECT count(*)::integer INTO v_assumidos
      FROM public.acesso_avaliar_academia(p_partner_id) a
     WHERE a.motivo = r.gatilho
       AND EXISTS (
         SELECT 1
           FROM public.academia_crm_cartoes ac
           JOIN public.crm_cartoes cc ON cc.id = ac.cartao_id
          WHERE ac.partner_id = p_partner_id
            AND COALESCE(ac.credencial_id, ac.student_id)
                = COALESCE(a.credencial_id, a.student_id)
            AND cc.arquivado_em IS NULL
            AND cc.coluna_id <> r.coluna_id
       );

    v_criados := 0;

    -- 3) Cria o que falta, um cartão por pessoa.
    FOR alvo IN
      SELECT a.student_id,
             a.credencial_id,
             a.valido_ate,
             COALESCE(pr.name, cr.nome_no_equipamento, 'Aluno da academia') AS nome,
             COALESCE(pr.phone, cr.telefone)                                AS telefone,
             pr.id AS profile_id,
             a.dias_restantes
        FROM public.acesso_avaliar_academia(p_partner_id) a
        LEFT JOIN public.students s          ON s.id  = a.student_id
        LEFT JOIN public.profiles pr         ON pr.id = s.profile_id
        LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
       WHERE a.motivo = r.gatilho
         AND NOT EXISTS (
           SELECT 1 FROM public.academia_crm_cartoes c
            WHERE c.partner_id = p_partner_id
              AND COALESCE(c.credencial_id, c.student_id)
                  = COALESCE(a.credencial_id, a.student_id)
              AND c.gatilho = r.gatilho
              AND c.referencia = a.valido_ate
         )
         AND NOT EXISTS (
           SELECT 1
             FROM public.academia_crm_cartoes ac
             JOIN public.crm_cartoes cc ON cc.id = ac.cartao_id
            WHERE ac.partner_id = p_partner_id
              AND COALESCE(ac.credencial_id, ac.student_id)
                  = COALESCE(a.credencial_id, a.student_id)
              AND cc.arquivado_em IS NULL
              AND cc.coluna_id <> r.coluna_id
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
    arquivados := COALESCE(v_arquivados, 0);
    RETURN NEXT;
  END LOOP;
END;
$function$;
