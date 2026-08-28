-- Funil e campanha na mesma tela.
--
-- Hoje as duas metades da mesma pergunta moram em abas diferentes: quem está em
-- cada etapa do funil está no CRM, e quem já recebeu mensagem está no Robô.
-- Para saber "quantos desta coluna ainda não receberam nada" alguém precisa
-- abrir as duas e conferir na mão, telefone por telefone.
--
-- NENHUMA TABELA NOVA. Tudo que responde a pergunta já existe — `crm_cartoes`
-- tem a coluna do funil, `bot_disparo_alvos` tem quem entrou em campanha. O que
-- faltava era o cruzamento. Guardar isso numa tabela criaria uma terceira
-- verdade sobre um fato que as duas primeiras já sabem.
--
-- O CRUZAMENTO É POR TELEFONE, NÃO POR `cartao_id`.
-- `bot_disparo_alvos.cartao_id` só é preenchido quando o alvo veio do funil
-- (`alvosDoFunil`). Campanha montada a partir dos alunos do leitor, de lista
-- colada, ou do aviso automático de vencimento grava o alvo sem cartão nenhum —
-- e é justamente essa a mensagem que a academia mais manda. Cruzando por
-- `cartao_id`, quase todo mundo apareceria como "nunca recebeu nada", que é
-- exatamente a resposta errada.
--
-- QUEM CONTA COMO ALCANÇADO: alvo em 'enviado' ou 'enfileirado'. 'pendente' é
-- lista montada num rascunho que talvez nunca dispare. E 'ignorado' é quem foi
-- DISPENSADO na hora do envio — por exemplo, quem renovou entre a montagem e o
-- disparo: a mensagem não saiu para ele, então ele não recebeu nada.
--
-- SÓ AUTOMÁTICO É UM NÚMERO PRÓPRIO. `bot_disparos.automatico` marca o que a
-- máquina montou (o aviso de vencimento). Alguém que só recebeu isso nunca leu
-- uma linha escrita pela academia, e somar os dois esconderia justamente essa
-- gente dentro do total de "alcançados".
--
-- O CORTE DE 10 DÍGITOS é o mesmo de `alvosDoFunil`: lá o telefone com menos de
-- 10 dígitos é descartado por falta de DDD. Se aqui o corte fosse outro, a tela
-- prometeria um número de contatos que a campanha não entregaria.
--
-- Não toca em dinheiro. Não cria tabela, não altera tabela, não altera policy.

-- ============================================================
-- 1. O FUNIL INTEIRO, COLUNA A COLUNA
-- ============================================================

CREATE OR REPLACE FUNCTION public.academia_funil_campanhas(
  p_partner_id uuid,
  p_quadro_id uuid
)
RETURNS TABLE (
  coluna_id uuid,
  coluna text,
  posicao double precision,
  tipo text,
  pessoas integer,
  sem_telefone integer,
  alcancados integer,
  so_automatico integer,
  nunca integer,
  ultima_campanha text,
  ultima_campanha_em timestamptz,
  ultima_automatica boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Esta checagem NÃO é o que protege a função: `academia_pode_ver` devolve
  -- true quando `auth.uid()` é nulo, que é o caso do visitante anônimo — foi
  -- assim que 413 alunos vazaram em 28/08/2026. Quem protege é o GRANT lá
  -- embaixo, que só deixa o service_role executar. Ela fica aqui para o dia em
  -- que alguém conceder a função a `authenticated`.
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  WITH quadro AS (
    -- Confere o dono aqui, e não no chamador: sem isto, passar o id do funil de
    -- outra academia leria o funil dela.
    SELECT q.id
      FROM public.crm_quadros q
     WHERE q.id = p_quadro_id
       AND q.escopo = 'parceiro'
       AND q.owner_id = p_partner_id
       AND q.arquivado_em IS NULL
  ),
  cartoes AS (
    SELECT c.id,
           c.coluna_id,
           regexp_replace(COALESCE(c.contato_telefone, ''), '\D', '', 'g') AS tel
      FROM public.crm_cartoes c
      JOIN quadro ON quadro.id = c.quadro_id
     WHERE c.arquivado_em IS NULL
  ),
  entregues AS (
    -- Uma linha por telefone, já resumida: se todas as campanhas que chegaram
    -- foram da máquina, quando foi a última, e qual foi.
    --
    -- `regexp_replace` dos DOIS lados. bot_disparo_alvos guarda o telefone
    -- formatado -- "(65) 9 8401-3711" -- e crm_cartoes guarda só dígitos.
    -- Cruzando os dois como estão, casavam 1 de 15 pessoas: a tela diria que
    -- quase ninguém recebeu campanha, que é justamente o número que ela existe
    -- para mostrar.
    SELECT regexp_replace(a.telefone, '\D', '', 'g') AS telefone,
           bool_and(d.automatico) AS so_maquina,
           max(COALESCE(d.iniciado_em, a.created_at)) AS quando,
           (array_agg(d.nome ORDER BY COALESCE(d.iniciado_em, a.created_at) DESC))[1] AS campanha,
           (array_agg(d.automatico ORDER BY COALESCE(d.iniciado_em, a.created_at) DESC))[1] AS campanha_automatica
      FROM public.bot_disparo_alvos a
      JOIN public.bot_disparos d ON d.id = a.disparo_id
     WHERE d.escopo = 'parceiro'
       AND d.owner_id = p_partner_id
       AND a.status IN ('enviado', 'enfileirado')
     GROUP BY regexp_replace(a.telefone, '\D', '', 'g')
  )
  SELECT col.id,
         col.nome::text,
         col.posicao,
         col.tipo::text,
         count(c.id)::integer,
         count(c.id) FILTER (WHERE length(c.tel) < 10)::integer,
         count(c.id) FILTER (WHERE length(c.tel) >= 10 AND e.telefone IS NOT NULL)::integer,
         count(c.id) FILTER (WHERE length(c.tel) >= 10 AND e.so_maquina)::integer,
         count(c.id) FILTER (WHERE length(c.tel) >= 10 AND e.telefone IS NULL)::integer,
         (array_agg(e.campanha ORDER BY e.quando DESC NULLS LAST))[1]::text,
         max(e.quando),
         (array_agg(e.campanha_automatica ORDER BY e.quando DESC NULLS LAST))[1]
    FROM public.crm_colunas col
    JOIN quadro ON quadro.id = col.quadro_id
    -- LEFT: coluna vazia também é resposta. Some da tela quem some do JOIN.
    LEFT JOIN cartoes c ON c.coluna_id = col.id
    LEFT JOIN entregues e ON e.telefone = c.tel
   GROUP BY col.id, col.nome, col.posicao, col.tipo
   ORDER BY col.posicao, col.nome;
END;
$fn$;

-- ============================================================
-- 2. AS PESSOAS POR TRÁS DE UM NÚMERO
-- ============================================================
-- Cada contagem da tela vira lista clicável. "18 nunca receberam nada" só vira
-- trabalho quando dá para ver quem são.

CREATE OR REPLACE FUNCTION public.academia_funil_campanhas_pessoas(
  p_partner_id uuid,
  p_coluna_id uuid,
  p_recorte text DEFAULT 'todos'
)
RETURNS TABLE (
  cartao_id uuid,
  nome text,
  telefone text,
  campanhas integer,
  ultima_campanha text,
  ultima_campanha_em timestamptz,
  ultima_automatica boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_recorte NOT IN ('todos', 'alcancados', 'so_automatico', 'nunca', 'sem_telefone') THEN
    RAISE EXCEPTION 'Recorte inválido: %', p_recorte;
  END IF;

  RETURN QUERY
  WITH coluna AS (
    SELECT col.id
      FROM public.crm_colunas col
      JOIN public.crm_quadros q ON q.id = col.quadro_id
     WHERE col.id = p_coluna_id
       AND q.escopo = 'parceiro'
       AND q.owner_id = p_partner_id
       AND q.arquivado_em IS NULL
  ),
  cartoes AS (
    SELECT c.id,
           COALESCE(NULLIF(btrim(COALESCE(c.contato_nome, '')), ''), c.titulo)::text AS nome,
           regexp_replace(COALESCE(c.contato_telefone, ''), '\D', '', 'g') AS tel
      FROM public.crm_cartoes c
      JOIN coluna ON coluna.id = c.coluna_id
     WHERE c.arquivado_em IS NULL
  ),
  entregues AS (
    SELECT regexp_replace(a.telefone, '\D', '', 'g') AS telefone,
           d.nome AS campanha,
           d.automatico AS automatica,
           COALESCE(d.iniciado_em, a.created_at) AS quando
      FROM public.bot_disparo_alvos a
      JOIN public.bot_disparos d ON d.id = a.disparo_id
     WHERE d.escopo = 'parceiro'
       AND d.owner_id = p_partner_id
       AND a.status IN ('enviado', 'enfileirado')
  )
  SELECT c.id,
         c.nome,
         NULLIF(c.tel, '')::text,
         count(e.telefone)::integer,
         (array_agg(e.campanha ORDER BY e.quando DESC NULLS LAST))[1]::text,
         max(e.quando),
         (array_agg(e.automatica ORDER BY e.quando DESC NULLS LAST))[1]
    FROM cartoes c
    LEFT JOIN entregues e ON e.telefone = c.tel AND length(c.tel) >= 10
   GROUP BY c.id, c.nome, c.tel
  HAVING CASE p_recorte
           WHEN 'alcancados' THEN count(e.telefone) > 0
           WHEN 'so_automatico' THEN count(e.telefone) > 0 AND bool_and(e.automatica)
           WHEN 'nunca' THEN count(e.telefone) = 0 AND length(c.tel) >= 10
           WHEN 'sem_telefone' THEN length(c.tel) < 10
           ELSE true
         END
   ORDER BY max(e.quando) DESC NULLS LAST, c.nome;
END;
$fn$;

-- ============================================================
-- 3. ACESSO
-- ============================================================
-- Só o service_role. As duas funções são lidas por server function que já
-- passou por `autorizar()` em src/lib/academia-teste.functions.ts; nenhuma tela
-- as chama direto do navegador. Sem o REVOKE elas nasceriam executáveis por
-- PUBLIC, e `academia_pode_ver` deixaria o anônimo passar.

REVOKE EXECUTE ON FUNCTION public.academia_funil_campanhas(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_funil_campanhas(uuid, uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.academia_funil_campanhas_pessoas(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_funil_campanhas_pessoas(uuid, uuid, text)
  TO service_role;
