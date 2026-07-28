## Problema

Ao criar novo cadastro de Empresa Parceira aparece:

> there is no unique or exclusion constraint matching the ON CONFLICT specification

## De onde surgiu

Na **Entrega 1 (parceiro com múltiplas unidades)** removemos a restrição de unicidade em `partners.profile_id` para permitir que um mesmo dono tenha várias unidades. Confirmado no banco: hoje `partners` só tem `UNIQUE (id)` e `UNIQUE (referral_code)` — não existe mais `UNIQUE (profile_id)`.

Mas em `src/lib/registration.server.ts` (função `finalizePartnerRegistration`, linhas ~400‑418) o insert do parceiro ainda usa:

```ts
supabaseAdmin.from("partners").upsert({...}, { onConflict: "profile_id" })
```

Como não há mais índice único em `profile_id`, o Postgres rejeita o ON CONFLICT e o cadastro quebra logo após validar o convite.

## Correção (mínima, sem quebrar multi-unidade)

Em `finalizePartnerRegistration`, substituir o `upsert` por um fluxo idempotente compatível com múltiplas unidades por dono:

1. Buscar em `partners` uma linha existente com o mesmo `profile_id` **e** mesmo `document` (a unidade que a pessoa está tentando cadastrar).
2. Se existir: `update` naquele `id` com os campos atualizados.
3. Se não existir: `insert` normal (nova unidade).

Sem `onConflict`, sem alterar schema, sem tocar em RLS, sem mexer no fluxo de múltiplas unidades. O resto da função (`ensureStudentForProfile`, compensação de erro) permanece igual.

## Verificação

- Cadastrar um novo parceiro pelo convite (o caso da tela) deve concluir sem o erro de ON CONFLICT.
- Refazer o mesmo cadastro (mesmo profile + mesmo CNPJ) deve atualizar a linha existente em vez de duplicar.
- Cadastrar uma segunda unidade (mesmo dono, CNPJ diferente) continua criando nova linha — comportamento de multi-unidade intacto.
- Cadastro de Coach / Aluno / Profissional não é tocado.

### Detalhes técnicos

Arquivo único afetado: `src/lib/registration.server.ts`, bloco do insert em `partners` dentro de `finalizePartnerRegistration`. Sem migration.