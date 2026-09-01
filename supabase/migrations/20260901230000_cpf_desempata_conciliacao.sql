-- O CPF desempata a conciliacao, e telefone de digito repetido deixa de ser evidencia.
--
-- Duas correcoes medidas no Reino Muay Thai em 01/09/2026:
--
-- 1. "Jean Reis" tem duas contas no mesmo telefone e por isso caia em 'baixa'
--    ("confirme quem e"). A credencial tem CPF e exatamente uma das contas tem
--    o mesmo CPF -- o desempate que a regua mandava o humano fazer ja estava no
--    banco, so nao era lido. CPF identico e unico dos dois lados agora vale
--    'alta' mesmo quando o telefone e ambiguo.
--
-- 2. "Davi Martins Pego de Freitas" casava com "Joao do Acai" em (99) 99999-9999
--    e saia como 'media'. Telefone de digito repetido nao e telefone: e campo
--    preenchido de qualquer jeito. Como academia_credencial_vincular religa
--    mensalidade PAGA para a credencial ligada, par errado em confianca media
--    mexe em dinheiro.
--
-- CPF divergente dos dois lados agora derruba o par para 'baixa': quando os dois
-- documentos existem e sao diferentes, nao e a mesma pessoa, por mais que o
-- telefone e o nome combinem.
--
-- Impacto na Estacao, medido antes de aplicar: nenhum. Ela tem 0 CPF em 416
-- credenciais, o que torna as regras de CPF inocuas la por construcao, e nenhum
-- dos seus 29 pares se apoia em telefone de digito repetido. Se um dia a Estacao
-- ganhar CPF, refazer a conta antes de mexer aqui de novo.
--
-- A assinatura e as colunas de saida nao mudam -- ConciliarCredenciais.tsx e
-- academia-conciliacao.functions.ts continuam valendo sem alteracao.

CREATE OR REPLACE FUNCTION public.academia_credenciais_sugerir_vinculo(p_partner_id uuid)
 RETURNS TABLE(credencial_id uuid, nome text, telefone text, student_id uuid, aluno text, aluno_telefone text, confianca text, motivo text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH cred AS (
    SELECT c.id,
           c.nome_no_equipamento AS nome,
           c.telefone,
           -- Digito repetido (99999999999, 00000000000) e campo preenchido de
           -- qualquer jeito, nao contato. Vira NULL para nao formar par.
           CASE WHEN public.academia_telefone_digitos(c.telefone) ~ '^(\d)\1+$'
                THEN NULL
                ELSE public.academia_telefone_digitos(c.telefone)
           END AS tel,
           nullif(regexp_replace(coalesce(c.cpf, ''), '\D', '', 'g'), '') AS cpf,
           public.academia_nome_chave(c.nome_no_equipamento) AS chave
      FROM public.academia_credenciais c
     WHERE c.partner_id = p_partner_id
       AND c.ativo
       AND c.student_id IS NULL
  ),
  -- Universo deliberadamente estreito. Varrer todos os alunos da plataforma
  -- mostraria gente de outras academias para quem nao tem nada a ver com elas.
  -- Aqui entra so quem ja tem relacao com esta unidade, mais quem bate com um
  -- telefone ou um CPF que a PROPRIA academia ja tem na credencial.
  aluno AS (
    SELECT s.id AS student_id,
           pr.name::text AS nome,
           pr.phone::text AS telefone,
           CASE WHEN public.academia_telefone_digitos(pr.phone) ~ '^(\d)\1+$'
                THEN NULL
                ELSE public.academia_telefone_digitos(pr.phone)
           END AS tel,
           nullif(regexp_replace(coalesce(pr.cpf, ''), '\D', '', 'g'), '') AS cpf,
           public.academia_nome_chave(pr.name) AS chave
      FROM public.students s
      JOIN public.profiles pr ON pr.id = s.profile_id
     WHERE s.id IN (SELECT a.student_id FROM public.academia_alunos_da_unidade(p_partner_id) a)
        OR public.academia_telefone_digitos(pr.phone) IN (SELECT c.tel FROM cred c WHERE c.tel IS NOT NULL)
        OR nullif(regexp_replace(coalesce(pr.cpf, ''), '\D', '', 'g'), '') IN (SELECT c.cpf FROM cred c WHERE c.cpf IS NOT NULL)
  ),
  -- Um aluno ja usado por outra credencial desta academia nao pode ser sugerido
  -- de novo: duas credenciais apontando para o mesmo aluno bagunca a avaliacao.
  livre AS (
    SELECT a.* FROM aluno a
     WHERE NOT EXISTS (
       SELECT 1 FROM public.academia_credenciais o
        WHERE o.partner_id = p_partner_id AND o.student_id = a.student_id
     )
  ),
  par AS (
    SELECT c.id AS cred_id, c.nome AS cred_nome, c.telefone AS cred_tel,
           a.student_id, a.nome AS aluno_nome, a.telefone AS aluno_tel,
           (c.tel IS NOT NULL AND c.tel = a.tel) AS bate_telefone,
           (c.cpf IS NOT NULL AND a.cpf IS NOT NULL AND c.cpf = a.cpf) AS bate_cpf,
           (c.cpf IS NOT NULL AND a.cpf IS NOT NULL AND c.cpf <> a.cpf) AS conflita_cpf,
           similarity(c.chave, a.chave) AS sem,
           (split_part(c.chave, ' ', 1) = split_part(a.chave, ' ', 1)) AS mesmo_primeiro_nome,
           EXISTS (
             SELECT 1
               FROM unnest(string_to_array(c.chave, ' ')) tc
               JOIN unnest(string_to_array(a.chave, ' ')) ta ON ta = tc
              WHERE length(tc) >= 3
                AND tc <> split_part(c.chave, ' ', 1)
           ) AS sobrenome_em_comum
      FROM cred c
      JOIN livre a
        ON (c.tel IS NOT NULL AND c.tel = a.tel)
        OR (c.cpf IS NOT NULL AND a.cpf IS NOT NULL AND c.cpf = a.cpf)
        OR (c.chave IS NOT NULL AND a.chave IS NOT NULL AND similarity(c.chave, a.chave) >= 0.55)
  ),
  contado AS (
    SELECT p.*,
           count(*) OVER (PARTITION BY p.cred_id)    AS alunos_para_a_credencial,
           count(*) OVER (PARTITION BY p.student_id) AS credenciais_para_o_aluno,
           count(*) FILTER (WHERE p.bate_cpf) OVER (PARTITION BY p.cred_id)    AS cpf_para_a_credencial,
           count(*) FILTER (WHERE p.bate_cpf) OVER (PARTITION BY p.student_id) AS cpf_para_o_aluno
      FROM par p
  )
  SELECT x.cred_id, x.cred_nome, x.cred_tel,
         x.student_id, x.aluno_nome, x.aluno_tel,
         x.confianca, x.motivo
    FROM (
      SELECT c.*,
             CASE
               -- Dois documentos que existem e divergem encerram o assunto,
               -- por mais que telefone e nome combinem.
               WHEN c.conflita_cpf
                 THEN 'baixa'
               WHEN c.bate_cpf
                AND c.cpf_para_a_credencial = 1
                AND c.cpf_para_o_aluno = 1
                 THEN 'alta'
               WHEN c.bate_telefone
                AND c.alunos_para_a_credencial = 1
                AND c.credenciais_para_o_aluno = 1
                AND c.mesmo_primeiro_nome
                AND (c.sobrenome_em_comum OR c.sem >= 0.60)
                 THEN 'alta'
               WHEN c.bate_telefone
                AND c.alunos_para_a_credencial = 1
                AND c.credenciais_para_o_aluno = 1
                 THEN 'media'
               ELSE 'baixa'
             END AS confianca,
             CASE
               WHEN c.conflita_cpf
                 THEN 'o CPF da credencial e o do aluno sao diferentes -- nao e a mesma pessoa'
               WHEN c.bate_cpf AND c.cpf_para_a_credencial = 1 AND c.cpf_para_o_aluno = 1
                 THEN 'CPF identico e unico dos dois lados'
               WHEN c.bate_cpf
                 THEN 'CPF bate, mas ha mais de um candidato com esse documento -- confirme'
               WHEN c.bate_telefone AND c.alunos_para_a_credencial > 1
                 THEN 'telefone bate, mas ha ' || c.alunos_para_a_credencial
                      || ' alunos com o mesmo numero -- confirme quem e'
               WHEN c.bate_telefone AND c.credenciais_para_o_aluno > 1
                 THEN 'telefone bate, mas este aluno serve a mais de uma credencial'
               WHEN c.bate_telefone AND NOT c.mesmo_primeiro_nome
                 THEN 'telefone identico, mas os nomes nao batem -- pode ser telefone de familia'
               WHEN c.bate_telefone AND NOT (c.sobrenome_em_comum OR c.sem >= 0.60)
                 THEN 'telefone identico e primeiro nome igual, mas o sobrenome diverge'
               WHEN c.bate_telefone
                 THEN 'telefone identico e unico dos dois lados, e o nome confere'
               ELSE 'so o nome se parece (' || round(c.sem::numeric, 2) || ') -- sem telefone que confirme'
             END AS motivo
        FROM contado c
    ) x
   ORDER BY CASE x.confianca WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
            x.sem DESC, x.cred_nome;
END;
$function$;
