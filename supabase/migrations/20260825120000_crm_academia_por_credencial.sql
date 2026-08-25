-- CRM da academia passa a enxergar aluno que só existe no leitor.
--
-- academia_crm_sincronizar fazia JOIN em `students` para achar nome e telefone.
-- Depois que aluno de academia deixou de precisar ser usuário do app, 400 das
-- 401 mensalidades ficaram com student_id nulo — e o JOIN derrubava todas elas.
-- Rodando na Estação em 25/08/2026, o resultado foi 1 cartão criado onde havia
-- 291 pessoas bloqueadas. Não deu erro: simplesmente não viu ninguém.
--
-- É a quarta vez que esta mesma armadilha aparece (retrato, avisos, listagem de
-- alunos e agora CRM). O padrão do conserto é sempre o mesmo: a régua no banco
-- já devolve as duas pontas, quem consome é que precisa parar de assumir aluno.

-- 1) A tabela de controle precisa saber apontar para credencial também.
ALTER TABLE public.academia_crm_cartoes
  ADD COLUMN IF NOT EXISTS credencial_id uuid REFERENCES public.academia_credenciais(id) ON DELETE CASCADE;

ALTER TABLE public.academia_crm_cartoes
  ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE public.academia_crm_cartoes
  DROP CONSTRAINT IF EXISTS academia_crm_cartao_tem_dono;
ALTER TABLE public.academia_crm_cartoes
  ADD CONSTRAINT academia_crm_cartao_tem_dono
  CHECK (student_id IS NOT NULL OR credencial_id IS NOT NULL);

-- 2) A unicidade passa a valer por PESSOA, seja ela aluno ou credencial.
--    Constraint não aceita expressão, então vira índice único.
ALTER TABLE public.academia_crm_cartoes
  DROP CONSTRAINT IF EXISTS academia_crm_cartao_unico;

CREATE UNIQUE INDEX IF NOT EXISTS academia_crm_cartao_unico
  ON public.academia_crm_cartoes
     (partner_id, (COALESCE(credencial_id, student_id)), gatilho, referencia);

-- 3) A sincronização, agora pelos dois caminhos.
CREATE OR REPLACE FUNCTION public.academia_crm_sincronizar(p_partner_id uuid)
RETURNS TABLE(gatilho text, criados integer, assumidos integer)
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
BEGIN
  FOR r IN
    SELECT g.gatilho, g.quadro_id, g.coluna_id
      FROM public.academia_crm_regras g
     WHERE g.partner_id = p_partner_id AND g.ativo
  LOOP
    -- Quantos ficaram de fora por já estarem sendo tratados pela equipe.
    -- A automação sai do caminho assim que alguém move o cartão.
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

    -- Laço explícito, um cartão por pessoa.
    --
    -- A versão anterior inseria em massa e casava o cartão novo de volta pelo
    -- profile_id. Isso não sobrevive ao mundo novo: profile_id agora é nulo em
    -- centenas de linhas, e casar por nome juntaria homônimos. Algumas centenas
    -- de linhas uma vez, e quase nada por dia — não vale trocar correção por
    -- desempenho aqui.
    FOR alvo IN
      SELECT a.student_id,
             a.credencial_id,
             a.valido_ate,
             -- Nome e telefone saem do perfil quando existe, e da credencial do
             -- leitor quando a pessoa só existe lá.
             COALESCE(pr.name, cr.nome_no_equipamento, 'Aluno da academia') AS nome,
             COALESCE(pr.phone, cr.telefone)                                AS telefone,
             pr.id AS profile_id,
             a.dias_restantes
        FROM public.acesso_avaliar_academia(p_partner_id) a
        LEFT JOIN public.students s          ON s.id  = a.student_id
        LEFT JOIN public.profiles pr         ON pr.id = s.profile_id
        LEFT JOIN public.academia_credenciais cr ON cr.id = a.credencial_id
       WHERE a.motivo = r.gatilho
         -- já tem cartão deste gatilho para este vencimento
         AND NOT EXISTS (
           SELECT 1 FROM public.academia_crm_cartoes c
            WHERE c.partner_id = p_partner_id
              AND COALESCE(c.credencial_id, c.student_id)
                  = COALESCE(a.credencial_id, a.student_id)
              AND c.gatilho = r.gatilho
              AND c.referencia = a.valido_ate
         )
         -- a equipe moveu um cartão anterior desta pessoa: ela assumiu
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
        -- Perdeu a corrida para outra execução: o cartão órfão não pode ficar
        -- no funil, senão a recepção trabalha duas vezes a mesma pessoa.
        DELETE FROM public.crm_cartoes WHERE id = v_cartao;
      END IF;
    END LOOP;

    gatilho := r.gatilho;
    criados := v_criados;
    assumidos := COALESCE(v_assumidos, 0);
    RETURN NEXT;
  END LOOP;
END;
$function$;
