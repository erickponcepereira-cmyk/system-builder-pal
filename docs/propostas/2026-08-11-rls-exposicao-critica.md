# Exposição crítica de dados por RLS — diagnóstico e correção

Levantado em 11/08/2026 a partir do scanner do Lovable. **Não aplicado.**
Migrations são de outro responsável; este documento traz o SQL pronto e a
análise de impacto para quem for aplicar.

## Resumo

Três achados críticos têm a mesma causa raiz: `CREATE POLICY` **sem cláusula
`TO`**. No Postgres, a ausência de `TO` faz a política valer para o papel
`PUBLIC`, que inclui `anon` — ou seja, qualquer pessoa na internet, sem login.

A chave `anon` do Supabase é pública por natureza (vai no bundle do cliente),
então a exploração é uma requisição HTTP simples.

## 1. Dados bancários dos coaches legíveis sem login — CRÍTICO

`supabase/migrations/20260427222707_706d20a0-0989-47bb-b6dc-3b4913ad1031.sql`

```sql
CREATE POLICY approved_coaches_public_select ON public.coaches
FOR SELECT
USING (approved_at IS NOT NULL);
```

Sem `TO authenticated`, `anon` lê **todas as colunas** de todo coach aprovado.
Na tabela `coaches` isso inclui:

- `bank_account`, `bank_agency`, `bank_name`, `bank_account_type`
- `pix_key`, `pix_key_type`
- `master_coach_commission_pct`, `total_sales`, `total_points`
- `council_number`, `professional_council`

## 2. Dados pessoais completos dos coaches legíveis sem login — CRÍTICO

Mesmo arquivo:

```sql
CREATE POLICY approved_coach_profiles_public_select ON public.profiles
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.coaches c
  WHERE c.profile_id = profiles.id AND c.approved_at IS NOT NULL
));
```

Expõe, de cada coach aprovado: `cpf`, `cpf_hash`, `email`, `phone`,
`birthdate`, `gender`, `blood_type`, `street`, `number`, `neighborhood`,
`city`, `state`, `zip_code`.

## 3. Senhas de contas de teste legíveis por qualquer logado — CRÍTICO

`supabase/migrations/20260713025314_af13b957-6c18-4368-99f2-bd5f7ea234de.sql`

```sql
CREATE POLICY "Authenticated can read test accounts"
  ON public.test_accounts FOR SELECT
  TO authenticated
  USING (true);
```

`test_accounts.default_password` é texto puro. Qualquer usuário logado —
inclusive aluno recém-cadastrado — lê todas as senhas.

## Impacto de remover as políticas

Verificado no código: **nenhum fluxo sem autenticação lê essas tabelas
diretamente.**

- `CoachSelector` usa a RPC `search_approved_coaches`
- `r.$code.tsx` usa `validate_referral_code`; o `from("profiles")` dele está
  dentro de `if (userData.user)` e lê o próprio perfil
- `lib/public-store.ts` não toca `coaches` nem `profiles`
- Server functions usam `supabaseAdmin`, que ignora RLS

`test_accounts` não é lido por nenhum arquivo de `src/` — só aparece em
`types.ts`.

Risco residual: 106 arquivos referenciam `coaches`. A varredura cobriu os
caminhos públicos; convém rodar a suíte e navegar cadastro e loja pública
depois de aplicar.

## SQL proposto

```sql
-- 1 e 2. Tira anon das tabelas sensíveis.
DROP POLICY IF EXISTS approved_coaches_public_select ON public.coaches;
DROP POLICY IF EXISTS approved_coach_profiles_public_select ON public.profiles;

-- RLS é row-level: para esconder COLUNA é preciso grant de coluna.
-- Sem isto, qualquer logado continua lendo dado bancário de todo coach.
REVOKE SELECT ON public.coaches FROM anon, authenticated;
GRANT SELECT (
  id, profile_id, referral_code, referral_link, approved_at, is_professional,
  specialty_key, specialty_custom_description, instagram, facebook, tiktok,
  social_links, coach_number, upline_coach_id, total_points, onboarding_stage,
  brand_theme_key, serves_whole_network, card_valid_until, is_test
) ON public.coaches TO authenticated;

-- Política nova, agora explicitamente só para logado.
CREATE POLICY approved_coaches_authenticated_select ON public.coaches
FOR SELECT TO authenticated
USING (approved_at IS NOT NULL);

-- 3. Contas de teste: só master admin.
DROP POLICY IF EXISTS "Authenticated can read test accounts" ON public.test_accounts;

CREATE POLICY test_accounts_master_admin_select ON public.test_accounts
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.user_id = auth.uid() AND p.is_master_admin = true
));
```

### Ainda pendente de inventário

Os achados de `SECURITY DEFINER` e `Function Search Path Mutable` precisam da
lista de funções, que exige acesso ao banco (o Supabase ligado via MCP nesta
máquina não é o do app). O padrão da correção é:

```sql
ALTER FUNCTION public.<nome>(<args>) SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.<nome>(<args>) FROM anon;  -- quando não for de uso público
```

Para levantar a lista:

```sql
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer, p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND (p.prosecdef IS TRUE OR p.proconfig IS NULL)
ORDER BY p.proname;
```

## Ordem sugerida

1. Aplicar o item 3 primeiro — isolado, sem dependência de UI.
2. Aplicar 1 e 2 juntos, e validar cadastro e loja pública em seguida.
3. Levantar as funções e tratar em lote.

Se algo quebrar, o retorno é recriar a política antiga — mas convém trocar por
uma RPC restrita em vez de reabrir a leitura pública.
