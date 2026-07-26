## O erro que aparece

Não é sobre senha fraca. A mensagem `new row violates row-level security policy for table "entity_share_codes"` acontece **depois** que a empresa é salva: um trigger tenta gerar automaticamente o código de compartilhamento do parceiro (`entity_share_codes`) e a política RLS dessa tabela bloqueia a inserção.

**Causa raiz:** o trigger `ensure_partner_share_code` (e o equivalente para coach) roda como o usuário logado, e a política exige `partners.profile_id = auth.uid()`. Só que `partners.profile_id` guarda o `profiles.id`, não o `auth.users.id`. Então o WITH CHECK nunca passa e todo cadastro de parceiro que dispara o trigger quebra. Foi por isso que só a Karla travou agora — o fluxo "Já sou parceiro" cai direto na inserção via cliente e ativa o trigger.

## Correção

1. Migration nova:
   - Marcar `public.ensure_partner_share_code()` e `public.ensure_coach_share_code()` como `SECURITY DEFINER` com `SET search_path = public` (elas já usam `ON CONFLICT DO NOTHING`, então continuam idempotentes e seguras).
   - Rodar um backfill para gerar códigos que faltaram por causa do bug (`INSERT ... SELECT` nas duas tabelas com `ON CONFLICT DO NOTHING`).
2. Melhoria de UX no formulário do parceiro (`PartnerRegistration.tsx`) e do profissional (`ProfessionalRegistration.tsx`):
   - Traduzir mensagens comuns em `translateAuthError` / erros de RLS para português amigável ("Não foi possível concluir o cadastro. Tente novamente ou fale com o suporte.").
   - Especificamente para senha fraca (`Password should be at least`, `weak_password`, `password is too short`), mostrar embaixo do campo de senha uma mensagem em português: "Senha muito fraca. Use pelo menos 8 caracteres com letras e números."
   - Já existe `PasswordStrengthMeter`; adicionar o `formError` também abaixo do campo quando for erro de senha, para a pessoa ver onde corrigir.

## Detalhes técnicos

- SQL principal:
  ```sql
  CREATE OR REPLACE FUNCTION public.ensure_partner_share_code() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ ... $$;
  CREATE OR REPLACE FUNCTION public.ensure_coach_share_code() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ ... $$;
  ```
- Backfill:
  ```sql
  INSERT INTO public.entity_share_codes (owner_type, owner_id, code)
    SELECT 'partner', id, public.generate_entity_share_code() FROM public.partners
    ON CONFLICT DO NOTHING;
  INSERT INTO public.entity_share_codes (owner_type, owner_id, code)
    SELECT 'professional', id, public.generate_entity_share_code() FROM public.coaches
    ON CONFLICT DO NOTHING;
  ```
- Frontend: adicionar detector de erro de senha em `translateAuthError` e exibir `passwordError` inline no campo (Partner e Professional). Nenhuma outra tela é afetada.
