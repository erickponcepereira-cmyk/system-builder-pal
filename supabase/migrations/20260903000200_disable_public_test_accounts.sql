-- Release batch: contas de teste nunca podem ser criadas por domínio arbitrário nem por visitante.
-- Aplicada depois das migrations mais recentes da Lovable.
CREATE OR REPLACE FUNCTION public.is_test_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.test_accounts
    WHERE lower(email) = lower(trim(_email))
  );
$$;

REVOKE ALL ON FUNCTION public.is_test_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_test_email(text) TO service_role;

-- Senhas não pertencem a uma tabela de configuração versionada.
ALTER TABLE public.test_accounts DROP COLUMN IF EXISTS default_password;

-- Os três slots e senhas foram publicados em uma migration antiga. Mesmo que
-- tenham sido criados depois, invalida credenciais/sessões conhecidas agora.
UPDATE auth.users
   SET encrypted_password = crypt(gen_random_uuid()::text, gen_salt('bf')),
       banned_until = 'infinity'::timestamptz,
       updated_at = now()
 WHERE lower(email) IN (
   'teste1@fitmind.test',
   'teste2@fitmind.test',
   'teste3@fitmind.test'
 );

DELETE FROM auth.sessions
 WHERE user_id IN (
   SELECT id FROM auth.users
   WHERE lower(email) IN (
     'teste1@fitmind.test',
     'teste2@fitmind.test',
     'teste3@fitmind.test'
   )
 );

DELETE FROM auth.refresh_tokens
 WHERE user_id IN (
   SELECT id::text FROM auth.users
   WHERE lower(email) IN (
     'teste1@fitmind.test',
     'teste2@fitmind.test',
     'teste3@fitmind.test'
   )
 );
