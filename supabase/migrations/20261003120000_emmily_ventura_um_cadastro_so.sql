-- Emmily Ventura tinha dois cadastros, abertos com cinco minutos de diferenca
-- em 19/08/2026: emmilyventura9@icloud.com (12:54, nunca usado para entrar) e
-- emmilyventura9@gmail.com (12:59, entrada pelo Google, e o que tem tudo).
--
-- O cadastro do gmail e o mais recente e o unico com historia: ativacao paga,
-- documentos conferidos, os dois produtos do Studio Fisiolotus, os 16 cupons,
-- a colaboradora Marcia, o pedido e a transacao. O do icloud so tem a casca -
-- e uma segunda mensalidade de R$ 100, que ja acumulava R$ 300 em aberto.
--
-- Unifica no gmail. O que a duplicada tinha de proprio (o ramo de atividade)
-- vai junto. A unidade duplicada nao vem para o perfil que fica: varios pontos
-- do app escolhem a unidade mais antiga do perfil, e trazer a vazia junto
-- esconderia a unidade de verdade. Ela fica no cadastro morto, bloqueada.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Retrato do antes, para poder voltar atras
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auditoria;
DROP TABLE IF EXISTS auditoria.emmily_ventura_20261003;

CREATE TABLE auditoria.emmily_ventura_20261003 AS
SELECT 'profiles'::text AS tabela, to_jsonb(t.*) AS linha FROM public.profiles t
 WHERE t.id IN ('905c480c-c20a-4a76-888a-43d1e05b9967','4d6c0561-d9e1-4e71-b017-027650b6109e')
UNION ALL SELECT 'coaches', to_jsonb(t.*) FROM public.coaches t
 WHERE t.id IN ('ca812026-9729-4a89-b526-8bcbab0f1172','45a19bdc-f1c2-44dd-ac5a-bace86a0ca01')
UNION ALL SELECT 'partners', to_jsonb(t.*) FROM public.partners t
 WHERE t.id IN ('41f52f82-f178-4f19-a4dd-24468cc85eba','ecb7a754-4d08-461c-b993-d404c3fac151')
UNION ALL SELECT 'students', to_jsonb(t.*) FROM public.students t
 WHERE t.id IN ('b5065169-3fcc-4d10-865e-ac9faaa38d9a','c562fcdf-440f-4e6d-8317-c7d140bba836')
UNION ALL SELECT 'student_wallets', to_jsonb(t.*) FROM public.student_wallets t
 WHERE t.student_id IN ('b5065169-3fcc-4d10-865e-ac9faaa38d9a','c562fcdf-440f-4e6d-8317-c7d140bba836')
UNION ALL SELECT 'wallets', to_jsonb(t.*) FROM public.wallets t
 WHERE t.profile_id IN ('905c480c-c20a-4a76-888a-43d1e05b9967','4d6c0561-d9e1-4e71-b017-027650b6109e')
UNION ALL SELECT 'partner_wallets', to_jsonb(t.*) FROM public.partner_wallets t
 WHERE t.partner_id IN ('41f52f82-f178-4f19-a4dd-24468cc85eba','ecb7a754-4d08-461c-b993-d404c3fac151')
UNION ALL SELECT 'professional_wallets', to_jsonb(t.*) FROM public.professional_wallets t
 WHERE t.professional_coach_id IN ('ca812026-9729-4a89-b526-8bcbab0f1172','45a19bdc-f1c2-44dd-ac5a-bace86a0ca01')
UNION ALL SELECT 'partner_members', to_jsonb(t.*) FROM public.partner_members t
 WHERE t.partner_id IN ('41f52f82-f178-4f19-a4dd-24468cc85eba','ecb7a754-4d08-461c-b993-d404c3fac151')
UNION ALL SELECT 'user_subscriptions', to_jsonb(t.*) FROM public.user_subscriptions t
 WHERE t.user_id IN ('106a3c35-d428-4bd1-8bce-55c72501b9c1','e03fd61f-44cf-4d8c-80a1-65a6739e3eb2')
UNION ALL SELECT 'subscription_invoices', to_jsonb(t.*) FROM public.subscription_invoices t
 WHERE t.user_id IN ('106a3c35-d428-4bd1-8bce-55c72501b9c1','e03fd61f-44cf-4d8c-80a1-65a6739e3eb2')
UNION ALL SELECT 'network_unlock_history', to_jsonb(t.*) FROM public.network_unlock_history t
 WHERE t.profile_id IN ('905c480c-c20a-4a76-888a-43d1e05b9967','4d6c0561-d9e1-4e71-b017-027650b6109e')
UNION ALL SELECT 'coach_evaluation_clients', to_jsonb(t.*) FROM public.coach_evaluation_clients t
 WHERE t.student_id IN ('b5065169-3fcc-4d10-865e-ac9faaa38d9a','c562fcdf-440f-4e6d-8317-c7d140bba836')
UNION ALL SELECT 'coach_patent_achievements', to_jsonb(t.*) FROM public.coach_patent_achievements t
 WHERE t.coach_id IN ('ca812026-9729-4a89-b526-8bcbab0f1172','45a19bdc-f1c2-44dd-ac5a-bace86a0ca01')
UNION ALL SELECT 'entity_share_codes', to_jsonb(t.*) FROM public.entity_share_codes t
 WHERE t.owner_id IN ('ca812026-9729-4a89-b526-8bcbab0f1172','45a19bdc-f1c2-44dd-ac5a-bace86a0ca01',
                      '41f52f82-f178-4f19-a4dd-24468cc85eba','ecb7a754-4d08-461c-b993-d404c3fac151')
UNION ALL SELECT 'notifications', to_jsonb(t.*) FROM public.notifications t
 WHERE t.profile_id IN ('905c480c-c20a-4a76-888a-43d1e05b9967','4d6c0561-d9e1-4e71-b017-027650b6109e')
UNION ALL SELECT 'terms_acceptances', to_jsonb(t.*) FROM public.terms_acceptances t
 WHERE t.user_id IN ('106a3c35-d428-4bd1-8bce-55c72501b9c1','e03fd61f-44cf-4d8c-80a1-65a6739e3eb2')
UNION ALL SELECT 'auth.users', jsonb_build_object('id', t.id, 'email', t.email, 'banned_until', t.banned_until)
  FROM auth.users t
 WHERE t.id IN ('106a3c35-d428-4bd1-8bce-55c72501b9c1','e03fd61f-44cf-4d8c-80a1-65a6739e3eb2');

REVOKE ALL ON auditoria.emmily_ventura_20261003 FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) O unico dado que so existia na duplicada
-- ---------------------------------------------------------------------------
UPDATE public.partners
   SET business_area = COALESCE(business_area, 'Estética, pilates, dermato'),
       city = 'Várzea Grande'
 WHERE id = 'ecb7a754-4d08-461c-b993-d404c3fac151';

-- ---------------------------------------------------------------------------
-- 3) A unificacao, pela funcao que ja existe
-- ---------------------------------------------------------------------------
SELECT public.admin_merge_profiles(
         '905c480c-c20a-4a76-888a-43d1e05b9967',
         '4d6c0561-d9e1-4e71-b017-027650b6109e',
         '331e4a6d-025e-4f6a-aa11-8d78a8be214f',
         false);

-- ---------------------------------------------------------------------------
-- 4) A unidade duplicada fica no cadastro morto, bloqueada
--    (o gatilho que protege o dono da unidade exige admin no JWT)
-- ---------------------------------------------------------------------------
SELECT set_config('request.jwt.claims',
                  json_build_object('sub', 'f974165f-afe8-4bba-9c8c-2d79659af5e9',
                                    'role', 'authenticated')::text, true);

UPDATE public.partner_members
   SET profile_id = '905c480c-c20a-4a76-888a-43d1e05b9967'
 WHERE id = '6f0a5a01-1bd9-470d-89ea-f93a555035bd';

UPDATE public.partners
   SET profile_id = '905c480c-c20a-4a76-888a-43d1e05b9967',
       status = 'blocked',
       blocked_at = now(),
       blocked_reason = 'Unidade duplicada. Cadastro unificado em emmilyventura9@gmail.com em 03/10/2026.'
 WHERE id = '41f52f82-f178-4f19-a4dd-24468cc85eba';

-- ---------------------------------------------------------------------------
-- 4b) A unificacao solta o cliente de avaliacao da duplicada em vez de apaga-lo,
--     e ele continuaria na lista da coach dela como uma segunda Emmily. Sem
--     avaliacao nenhuma presa nele, sai.
-- ---------------------------------------------------------------------------
DELETE FROM public.coach_evaluation_clients c
 WHERE c.id = '591cb430-a778-42e5-abce-7ee8c2c21de1'
   AND c.student_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM public.coach_body_assessments a WHERE a.client_id = c.id);

-- ---------------------------------------------------------------------------
-- 5) Os dois retratos de carreira da duplicada sao copia zerada dos que ela ja
--    tem nos mesmos meses: o perfil deles ficou no cadastro morto e o coach
--    passou para o que fica, uma mistura que nao descreve nada.
-- ---------------------------------------------------------------------------
DELETE FROM public.network_unlock_history
 WHERE id IN ('9761a074-0897-4eff-8601-239993c9bdb1','52fb3ab5-2a81-4fdf-ac19-6e7717782319');

SELECT set_config('request.jwt.claims', '', true);

COMMIT;
