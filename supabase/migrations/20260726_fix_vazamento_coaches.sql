-- =====================================================================
-- FitMind Club — Correcao de vazamento em public.coaches
--
-- PROBLEMA VERIFICADO: rodando `SET LOCAL ROLE anon`, um usuario anonimo
-- le 53 linhas de public.coaches, incluindo 9 chaves PIX preenchidas.
-- As colunas bank_account / bank_agency / bank_name estao vazias hoje,
-- mas seriam expostas no momento em que qualquer coach as preencher.
--
-- CAUSA: grant amplo de SELECT na tabela inteira para o papel anon.
-- O RLS (approved_coaches_public_select) filtra LINHAS, nao COLUNAS.
--
-- ESTRATEGIA: revogar o acesso amplo e devolver apenas as colunas que
-- o fluxo de cadastro por indicacao realmente usa (resolver referral_code
-- para um coach). Verificado em StudentRegistration.tsx,
-- ProfessionalRegistration.tsx e PartnerRegistration.tsx.
--
-- REVERSAO: em caso de quebra no cadastro, rode
--   GRANT SELECT ON public.coaches TO anon;
-- e o comportamento anterior volta na hora.
-- =====================================================================

BEGIN;

REVOKE SELECT ON public.coaches FROM anon;

GRANT SELECT (
  id,
  profile_id,
  referral_code,
  upline_coach_id,
  approved_at,
  is_professional
) ON public.coaches TO anon;

COMMIT;

-- =====================================================================
-- VERIFICACAO (rodar depois, deve dar erro de permissao nas sensiveis)
-- =====================================================================
-- SET LOCAL ROLE anon; SELECT count(*) FROM coaches;                -- deve funcionar
-- SET LOCAL ROLE anon; SELECT count(pix_key) FROM coaches;          -- deve NEGAR
-- SET LOCAL ROLE anon; SELECT count(bank_account) FROM coaches;     -- deve NEGAR
-- SET LOCAL ROLE anon; SELECT count(referral_code) FROM coaches;    -- deve funcionar
