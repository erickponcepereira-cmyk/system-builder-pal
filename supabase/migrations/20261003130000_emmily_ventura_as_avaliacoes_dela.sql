-- Terceira copia da Emmily: a ficha de avaliacao que a coach dela (Ana Flavia)
-- abriu na mao em 18/05/2026, "Emmily Costa Ventura", com as tres avaliacoes
-- de 30/10/2024, 22/01/2025 e 13/02/2025. Mesmo nascimento (18/03/1996) e
-- mesmo WhatsApp do cadastro dela, mas solta do login - entao a Emmily nunca
-- viu essas avaliacoes no app, e a Ana Flavia via duas Emmilys na lista.
--
-- As avaliacoes passam para a ficha ligada ao login. As tres linhas repetidas
-- (reimportacao de 28/05/2026, identicas campo a campo) saem, e a ficha antiga,
-- ja vazia, sai com elas.
--
-- A reimportacao de 28/05 nao foi so aqui: 3.683 clientes de 4 coaches tem
-- avaliacao em dobro. Isso e outro assunto, decidido a parte.

BEGIN;

CREATE SCHEMA IF NOT EXISTS auditoria;
DROP TABLE IF EXISTS auditoria.emmily_ventura_avaliacoes_20261003;

CREATE TABLE auditoria.emmily_ventura_avaliacoes_20261003 AS
SELECT 'coach_evaluation_clients'::text AS tabela, to_jsonb(t.*) AS linha
  FROM public.coach_evaluation_clients t
 WHERE t.id IN ('c17f9c16-0016-406e-a6eb-b54eba07b042','ded82aca-553e-40a8-9157-8d68ee9d0a32')
UNION ALL
SELECT 'coach_body_assessments', to_jsonb(t.*)
  FROM public.coach_body_assessments t
 WHERE t.client_id IN ('c17f9c16-0016-406e-a6eb-b54eba07b042','ded82aca-553e-40a8-9157-8d68ee9d0a32');

REVOKE ALL ON auditoria.emmily_ventura_avaliacoes_20261003 FROM PUBLIC, anon, authenticated;

-- A altura so estava na ficha antiga.
UPDATE public.coach_evaluation_clients
   SET height = 155, height_unit = 'cm'
 WHERE id = 'ded82aca-553e-40a8-9157-8d68ee9d0a32'
   AND height IS NULL;

-- As tres avaliacoes de verdade passam para a ficha do login dela.
UPDATE public.coach_body_assessments
   SET client_id = 'ded82aca-553e-40a8-9157-8d68ee9d0a32',
       student_id = 'c562fcdf-440f-4e6d-8317-c7d140bba836'
 WHERE id IN ('99feae13-51dd-4ed5-ae85-96f2e44ea493',
              'ef4530ec-67c2-40f2-ac92-c3318a48b247',
              '3bc73d4e-572c-400b-9e7e-5aee9f18aa93');

-- As copias identicas da reimportacao.
DELETE FROM public.coach_body_assessments
 WHERE id IN ('7a5f5bdd-5642-4477-bf54-f700248600ac',
              'a57f01ca-ff74-4674-a6bb-1664bf78537d',
              'accda258-df69-4682-b9f3-e3f82189fdaf');

-- A ficha antiga, agora sem nada preso nela.
DELETE FROM public.coach_evaluation_clients c
 WHERE c.id = 'c17f9c16-0016-406e-a6eb-b54eba07b042'
   AND NOT EXISTS (SELECT 1 FROM public.coach_body_assessments a WHERE a.client_id = c.id);

COMMIT;
