-- Automacao de CRM da academia.
--
-- Liga a regua de acesso ao CRM que ja existe: quando um aluno entra num estado
-- (vencimento proximo, carencia, bloqueado) ou usa day-use, aparece um cartao no
-- funil escolhido pela academia.
--
-- Nao cria CRM novo. crm_quadros ja suporta quantos funis a academia quiser —
-- leads frios, perdidos, retencao — cada um com suas colunas. Isto so decide
-- para onde cada gatilho manda o cartao.

-- 1. Regras ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.academia_crm_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  gatilho text NOT NULL CHECK (gatilho IN
    ('vencimento_proximo', 'em_carencia', 'vencido_bloqueado', 'dayuse_novo')),
  quadro_id uuid NOT NULL REFERENCES public.crm_quadros(id) ON DELETE CASCADE,
  coluna_id uuid NOT NULL REFERENCES public.crm_colunas(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_crm_regra_unica UNIQUE (partner_id, gatilho)
);

ALTER TABLE public.academia_crm_regras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_crm_regras_acesso ON public.academia_crm_regras;
CREATE POLICY academia_crm_regras_acesso ON public.academia_crm_regras
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- 2. Idempotencia ------------------------------------------------------------
-- Mesma disciplina dos avisos: a chave inclui a referencia (o vencimento), para
-- o aluno nao ganhar um cartao novo a cada sincronizacao. Renovou, virou outra
-- referencia, e um cartao novo pode nascer no proximo ciclo.

CREATE TABLE IF NOT EXISTS public.academia_crm_cartoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  gatilho text NOT NULL,
  referencia date NOT NULL,
  cartao_id uuid REFERENCES public.crm_cartoes(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_crm_cartao_unico UNIQUE (partner_id, student_id, gatilho, referencia)
);

ALTER TABLE public.academia_crm_cartoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_crm_cartoes_leitura ON public.academia_crm_cartoes;
CREATE POLICY academia_crm_cartoes_leitura ON public.academia_crm_cartoes
  FOR SELECT USING (public.academia_pode_ver(partner_id));

-- 3. Sincronizacao -----------------------------------------------------------
-- Le a mesma regua da catraca (acesso_avaliar_academia) e cria os cartoes que
-- faltam. Nao move cartao que ja existe: quem manda no cartao depois de criado
-- e a equipe, nao a automacao — mover sozinho apagaria o trabalho de quem esta
-- tratando o aluno.

CREATE OR REPLACE FUNCTION public.academia_crm_sincronizar(p_partner_id uuid)
RETURNS TABLE (gatilho text, criados integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_criados integer;
BEGIN
  FOR r IN
    SELECT g.gatilho, g.quadro_id, g.coluna_id
      FROM public.academia_crm_regras g
     WHERE g.partner_id = p_partner_id AND g.ativo
  LOOP
    v_criados := 0;

    WITH alvos AS (
      SELECT a.student_id, a.valido_ate, pr.name AS nome, pr.phone AS telefone, pr.id AS profile_id,
             a.dias_restantes
        FROM public.acesso_avaliar_academia(p_partner_id) a
        JOIN public.students s  ON s.id = a.student_id
        JOIN public.profiles pr ON pr.id = s.profile_id
       WHERE a.motivo = r.gatilho
         AND NOT EXISTS (
           SELECT 1 FROM public.academia_crm_cartoes c
            WHERE c.partner_id = p_partner_id
              AND c.student_id = a.student_id
              AND c.gatilho = r.gatilho
              AND c.referencia = a.valido_ate
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
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_crm_sincronizar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_crm_sincronizar(uuid) TO authenticated, service_role;
