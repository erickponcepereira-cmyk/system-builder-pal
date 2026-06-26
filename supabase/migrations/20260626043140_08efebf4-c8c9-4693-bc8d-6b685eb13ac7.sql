-- Fase 6 LGPD: restringir acesso à coluna profiles.cpf via privilégios de coluna
-- Remove SELECT direto na coluna cpf para anon e authenticated; acesso passa a
-- ocorrer somente via funções auditadas get_my_cpf() e admin_reveal_cpf().

-- Revoga acesso amplo herdado
REVOKE SELECT ON public.profiles FROM anon, authenticated;

-- Concede SELECT explícito em todas as colunas EXCETO cpf
GRANT SELECT (
  admin_permissions, avatar_url, bio, birthdate, blood_type, city,
  created_at, email, gender, id, instagram, is_master_admin,
  last_app_login_at, name, neighborhood, number, patent, phone,
  photo_url, profession, report_permissions, role, state, status,
  street, theme_preference, updated_at, user_id, zip_code
) ON public.profiles TO authenticated;

GRANT SELECT (
  admin_permissions, avatar_url, bio, birthdate, blood_type, city,
  created_at, email, gender, id, instagram, is_master_admin,
  last_app_login_at, name, neighborhood, number, patent, phone,
  photo_url, profession, report_permissions, role, state, status,
  street, theme_preference, updated_at, user_id, zip_code
) ON public.profiles TO anon;

-- Mantém INSERT/UPDATE/DELETE conforme políticas RLS já existentes
GRANT INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Garante que as funções auditadas continuem operando (security definer)
-- get_my_cpf e admin_reveal_cpf já existem da Fase 1.

-- Adiciona coluna de hash para permitir lookups de unicidade sem expor o CPF
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf_hash text
  GENERATED ALWAYS AS (
    CASE WHEN cpf IS NULL THEN NULL ELSE encode(digest(cpf, 'sha256'), 'hex') END
  ) STORED;

CREATE INDEX IF NOT EXISTS profiles_cpf_hash_idx ON public.profiles(cpf_hash);

-- cpf_hash é seguro para leitura: não revela o número.
GRANT SELECT (cpf_hash) ON public.profiles TO authenticated, anon;