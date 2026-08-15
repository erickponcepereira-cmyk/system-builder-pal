-- Isola a busca de alunos por academia.
--
-- PROBLEMA: academia_credencial_sugestoes e a busca da tela varriam TODOS os
-- alunos da plataforma e devolviam nome e e-mail. Num SaaS, isso mostra dados de
-- alunos de outras academias e de outros coaches para quem nao tem nada a ver
-- com eles. Exposicao de dado pessoal entre clientes distintos.
--
-- REGRA NOVA: a academia enxerga por nome apenas quem ja tem relacao com ela —
-- mensalidade, frequencia ou credencial. Para trazer alguem novo, precisa do
-- CPF ou do e-mail COMPLETO, que so quem esta na frente dela consegue informar.
--
-- Isso preserva os dois fluxos reais (vincular quem ja treina ali, e cadastrar
-- quem acabou de chegar) sem transformar a busca num diretorio da plataforma.

-- Quem ja tem relacao com esta academia -------------------------------------

CREATE OR REPLACE FUNCTION public.academia_alunos_da_unidade(p_partner_id uuid)
RETURNS TABLE (student_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.student_id FROM public.academia_mensalidades m WHERE m.partner_id = p_partner_id
  UNION
  SELECT f.student_id FROM public.academia_frequencias f WHERE f.partner_id = p_partner_id
  UNION
  SELECT c.student_id FROM public.academia_credenciais c
   WHERE c.partner_id = p_partner_id AND c.student_id IS NOT NULL
  UNION
  SELECT v.student_id FROM public.partner_visits v WHERE v.partner_id = p_partner_id;
$$;

-- Busca para vincular --------------------------------------------------------
-- Por nome: so quem ja e da casa.
-- Por CPF ou e-mail: precisa do valor INTEIRO, nao serve pedaco. Assim nao da
-- para varrer a base testando prefixos.

CREATE OR REPLACE FUNCTION public.academia_buscar_aluno(
  p_partner_id uuid,
  p_termo text
)
RETURNS TABLE (student_id uuid, nome text, ja_e_da_casa boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_termo text := trim(COALESCE(p_termo, ''));
  v_digitos text := regexp_replace(v_termo, '\D', '', 'g');
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF length(v_termo) < 3 THEN RETURN; END IF;

  -- 1. CPF completo: identificacao exata, quem informou estava presente
  IF length(v_digitos) = 11 THEN
    RETURN QUERY
    SELECT s.id, pr.name::text, true
      FROM public.students s
      JOIN public.profiles pr ON pr.id = s.profile_id
     WHERE regexp_replace(COALESCE(pr.cpf, ''), '\D', '', 'g') = v_digitos
     LIMIT 5;
    RETURN;
  END IF;

  -- 2. E-mail completo: idem
  IF v_termo LIKE '%@%' AND v_termo LIKE '%.%' THEN
    RETURN QUERY
    SELECT s.id, pr.name::text, true
      FROM public.students s
      JOIN public.profiles pr ON pr.id = s.profile_id
     WHERE lower(pr.email) = lower(v_termo)
     LIMIT 5;
    RETURN;
  END IF;

  -- 3. Nome: apenas quem ja tem relacao com esta academia
  RETURN QUERY
  SELECT s.id, pr.name::text, true
    FROM public.students s
    JOIN public.profiles pr ON pr.id = s.profile_id
   WHERE s.id IN (SELECT a.student_id FROM public.academia_alunos_da_unidade(p_partner_id) a)
     AND pr.name ILIKE '%' || v_termo || '%'
   ORDER BY pr.name
   LIMIT 20;
END;
$$;

-- Sugestao de vinculo, agora isolada ----------------------------------------
-- Deixa de devolver e-mail: para escolher entre homonimos da propria academia,
-- o nome basta. E-mail ali era dado a mais sem necessidade.

DROP FUNCTION IF EXISTS public.academia_credencial_sugestoes(uuid, uuid);

CREATE OR REPLACE FUNCTION public.academia_credencial_sugestoes(
  p_partner_id uuid,
  p_credencial_id uuid
)
RETURNS TABLE (student_id uuid, nome text, semelhanca real)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.nome_no_equipamento INTO v_nome
    FROM public.academia_credenciais c
   WHERE c.id = p_credencial_id AND c.partner_id = p_partner_id;

  IF COALESCE(trim(v_nome), '') = '' THEN RETURN; END IF;

  RETURN QUERY
  SELECT s.id, pr.name::text, similarity(lower(pr.name), lower(v_nome))
    FROM public.students s
    JOIN public.profiles pr ON pr.id = s.profile_id
   WHERE s.id IN (SELECT a.student_id FROM public.academia_alunos_da_unidade(p_partner_id) a)
     AND pr.name IS NOT NULL
     AND similarity(lower(pr.name), lower(v_nome)) > 0.25
   ORDER BY 3 DESC, pr.name
   LIMIT 8;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_alunos_da_unidade(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_buscar_aluno(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_credencial_sugestoes(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.academia_alunos_da_unidade(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_buscar_aluno(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_credencial_sugestoes(uuid, uuid) TO authenticated, service_role;
