-- A importacao de avaliacoes rodou duas vezes e deixou copia exata em 3.105
-- fichas. Sao dois episodios, achados ao unificar o cadastro da Emmily:
--
--   28/05/2026 - a Ana Flavia reimportou o que ja tinha entrado em 18/05;
--   06/07/2026 - a importacao do Nathan gravou tudo em dobro no mesmo dia.
--
-- Apaga **so copia exata**: linha identica campo a campo a outra, ignorando
-- id, created_at e updated_at. Fica sempre uma de cada.
--
-- O que NAO e tocado, de proposito:
--
--   - Par com mesma data e medida diferente (782 grupos: peso, gordura, IMC,
--     idade). Sao duas pesagens de verdade registradas na mesma data, nao
--     duplicata - apagar perderia medicao.
--   - As 9.336 avaliacoes do Lucinei criadas em 28/05/2026. A importacao dele
--     carimbou **a data da importacao** em todas, entao uma ficha aparece com
--     ate 36 linhas "no mesmo dia", todas diferentes. E data perdida, nao
--     copia, e so volta com o arquivo de origem.
--   - Linha que tem link publico de resultado (`assessment_shares`): o token
--     de `/resultado/<token>` e o `initial_share_url` /`final_share_url` em
--     `competition_enrollments` apontam para a avaliacao pelo id. Quando uma
--     das copias tem link, ela e a que fica; se as duas tiverem, nenhuma sai.
--
-- Nada no banco aponta para `coach_body_assessments` por chave estrangeira
-- (conferido), e no codigo so `assessment_shares` e `coach_assessment_deletions`
-- guardam o id de uma avaliacao - entao a remocao nao arrasta mais nada.
--
-- Nao grava em `coach_assessment_deletions`: aquela tela e o historico do que
-- **os coaches** apagaram, com motivo declarado, e mostra 500 linhas. Jogar
-- 6.370 remocoes de sistema ali cegaria a tela. O registro e esta migration
-- mais a tabela de backup abaixo.

BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;
DROP TABLE IF EXISTS backup.avaliacoes_duplicadas_20261005;

-- A tabela de backup e a propria definicao do que sai.
CREATE TABLE backup.avaliacoes_duplicadas_20261005 AS
WITH marcadas AS (
  SELECT t.id,
         md5((to_jsonb(t.*) - 'id' - 'created_at' - 'updated_at')::text) AS corpo,
         row_number() OVER (
           PARTITION BY md5((to_jsonb(t.*) - 'id' - 'created_at' - 'updated_at')::text)
           ORDER BY (EXISTS (SELECT 1 FROM public.assessment_shares s WHERE s.assessment_id = t.id)) DESC,
                    t.created_at, t.id) AS n
  FROM public.coach_body_assessments t
), sobra AS (
  SELECT m.id, m.corpo
    FROM marcadas m
   WHERE m.n > 1
     AND NOT EXISTS (SELECT 1 FROM public.assessment_shares s WHERE s.assessment_id = m.id)
)
SELECT s.corpo, to_jsonb(a.*) AS linha
  FROM sobra s
  JOIN public.coach_body_assessments a ON a.id = s.id;

REVOKE ALL ON backup.avaliacoes_duplicadas_20261005 FROM PUBLIC, anon, authenticated;

DELETE FROM public.coach_body_assessments a
 USING backup.avaliacoes_duplicadas_20261005 b
 WHERE a.id = (b.linha->>'id')::uuid;

DROP TABLE IF EXISTS backup.trabalho_dup_avaliacoes;

COMMIT;
