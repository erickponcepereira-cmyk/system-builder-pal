-- A catraca dizia "Nao cadastrado" para quem estava com a mensalidade em dia.
--
-- Caso: Cryslaine Kelly, Estacao Funcional. Em 03/11/2026 a recepcao a
-- cadastrou duas vezes, com tres minutos de diferenca: 700037 (telefone
-- 65999333745) e 700038 (6599333745 - faltando um 9). O rosto ficou gravado
-- no leitor como 700037; a mensalidade (R$ 145, ate 03/12) foi lancada no
-- 700038. O leitor reconhece o rosto, reporta 700037, o agente nao acha esse
-- numero entre os liberados e a catraca mostra "Nao cadastrado": 15 recusas
-- `nao_encontrado` entre 03/11 e 09/11, nenhuma entrada.
--
-- 1. Os dois cadastros viram um. Fica o 700037, que e o numero do rosto no
--    equipamento e o telefone completo; a mensalidade passa para ele e o
--    700038 e desligado. A mensalidade era a unica linha ligada ao 700038
--    (conferido nas seis tabelas com FK para academia_credenciais). Retrato do
--    antes em `backup.credencial_duplicada_20261109`.
--
-- 2. Por que o cadastro de balcao deixou passar: ele procurava a pessoa pelo
--    telefone escrito EXATAMENTE igual. Erro de digitacao escapa, e 482 dos 548
--    cadastros ativos guardam o telefone formatado - "(65) 9 9289-9725" nunca e
--    igual a "65992899725". Na pratica a busca nao achava quem veio do leitor.
--    `academia_pessoa_ja_cadastrada` compara digitos, e tambem nome com data de
--    nascimento. Quem decide o que fazer com o achado e o servidor
--    (`cadastrarPessoaAcademia`): mesmo nome e a mesma pessoa; mesmo telefone
--    com outro nome vira pergunta para a recepcao, porque ha telefone dividido
--    por familia (3 numeros em 6 pessoas na Estacao).
--
-- Fica de fora, de proposito: Hellen Cristine Santos de Oliveira, recadastrada
-- hoje como 700040 com mensalidade, ja existia como 59 (vinda do Next Fit, mesmo
-- telefone). Nao ha como saber daqui em qual dos dois numeros o rosto dela
-- esta - o leitor da Estacao nao informa quem tem rosto (rosto_em vazio nos
-- 462 do grupo) e ela ainda nao passou na catraca. Juntar no numero errado
-- trancaria a porta para ela.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Cryslaine Kelly: um identificador so
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS backup;

CREATE TABLE IF NOT EXISTS backup.credencial_duplicada_20261109 AS
SELECT 'academia_credenciais'::text AS tabela, to_jsonb(c.*) AS linha
  FROM public.academia_credenciais c
 WHERE c.id IN ('f76fb9a3-9b35-40e5-a02d-baeddc5704cc', 'e52089aa-292a-42b2-923d-a1c8c9e5ef76')
UNION ALL
SELECT 'academia_mensalidades', to_jsonb(m.*)
  FROM public.academia_mensalidades m
 WHERE m.credencial_id = 'e52089aa-292a-42b2-923d-a1c8c9e5ef76';

REVOKE ALL ON backup.credencial_duplicada_20261109 FROM PUBLIC, anon, authenticated;

UPDATE public.academia_mensalidades
   SET credencial_id = 'f76fb9a3-9b35-40e5-a02d-baeddc5704cc',
       observacao = concat_ws(' | ', NULLIF(btrim(observacao), ''),
                              'Movida do id 700038 (cadastro em dobro da mesma pessoa) em 09/11/2026')
 WHERE credencial_id = 'e52089aa-292a-42b2-923d-a1c8c9e5ef76';

UPDATE public.academia_credenciais
   SET ativo = false
 WHERE id = 'e52089aa-292a-42b2-923d-a1c8c9e5ef76'
   AND partner_id = '646c99dd-23cc-4da5-ba96-e52cfb1384b4';

-- ---------------------------------------------------------------------------
-- 2) Achar a pessoa antes de criar outra
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.academia_pessoa_ja_cadastrada(
  p_partner_id uuid,
  p_nome text,
  p_telefone text,
  p_nascimento date
)
RETURNS TABLE (credencial_id uuid, referencia text, nome text, mesmo_nome boolean)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH pedido AS (
    SELECT public.sem_acento(lower(regexp_replace(btrim(COALESCE(p_nome, '')), '\s+', ' ', 'g'))) AS nome,
           regexp_replace(COALESCE(p_telefone, ''), '\D', '', 'g') AS telefone
  ),
  candidatas AS (
    SELECT c.id, c.referencia, c.created_at,
           COALESCE(NULLIF(btrim(c.nome_no_equipamento), ''), p_nome) AS nome,
           public.sem_acento(lower(regexp_replace(btrim(COALESCE(c.nome_no_equipamento, '')), '\s+', ' ', 'g')))
             = p.nome AS mesmo_nome,
           p.telefone <> ''
             AND regexp_replace(COALESCE(c.telefone, ''), '\D', '', 'g') = p.telefone AS mesmo_telefone,
           c.nascimento = p_nascimento AS mesmo_nascimento
      FROM public.academia_credenciais c, pedido p
     WHERE c.partner_id = p_partner_id
       AND c.ativo
  )
  SELECT k.id, k.referencia, k.nome, k.mesmo_nome
    FROM candidatas k
   WHERE (k.mesmo_nome AND (k.mesmo_telefone OR k.mesmo_nascimento))
      OR k.mesmo_telefone
   ORDER BY k.mesmo_nome DESC, k.mesmo_telefone DESC, k.created_at
   LIMIT 1;
$function$;

COMMENT ON FUNCTION public.academia_pessoa_ja_cadastrada(uuid, text, text, date) IS
  'Cadastro ativo da academia que parece ser a pessoa sendo cadastrada: mesmo nome com mesmo telefone ou nascimento (mesmo_nome = true), ou so o mesmo telefone. Telefone comparado por digitos. Usada por cadastrarPessoaAcademia antes de criar identificador novo.';

REVOKE ALL ON FUNCTION public.academia_pessoa_ja_cadastrada(uuid, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.academia_pessoa_ja_cadastrada(uuid, text, text, date) TO service_role;

COMMIT;
