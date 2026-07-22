## Diagnóstico (confirmado no banco)

O registro do `sindscond@gmail.com` foi criado com:
- `approved_at = 2026-07-22 22:15` (já aprovado)
- `onboarding_stage = "released"`
- `activation_paid_at` preenchido, `activation_source = "already_professional"`, `already_coach = true`
- `profiles.status = active`

Ou seja, o cadastro se **auto-aprovou** na hora da criação. Por isso ele não aparece na aba "Liberar Profissionais" — o `listAllProfessionalReleases` filtra `approved_at IS NULL` por padrão (só mostra aprovados quando o checkbox "Incluir aprovados" é marcado).

A causa está em `src/components/auth/ProfessionalRegistration.tsx` (linhas 162–185) e em `src/lib/registration.server.ts` (linhas 248–276, 473–487): quando o usuário marca "já sou coach/profissional FitMind" (ou entra pelo fluxo `existingMode`), o código grava `approved_at = now()`, `onboarding_stage = "released"` e `activation_paid_at = now()` direto — pulando qualquer revisão do admin.

## Objetivo

Todo novo cadastro de profissional (novo OU já-coach) precisa cair pendente na aba **Liberar Profissionais**, e o admin precisa conseguir a partir de lá:
1. Confirmar o e-mail (já existe: `adminConfirmProfessionalEmail`).
2. Definir/ver especialidade (já existe: `adminSetProfessionalSpecialty`).
3. **Isentar a taxa anual** (novo botão explícito, reaproveitando `adminGrantProfessionalActivation` com nota padrão "Anuidade isenta pelo admin").
4. Aprovar liberando o painel (já existe: `adminApproveProfessionalFinal`).

## Mudanças

### 1. Parar a auto-aprovação no cadastro (frontend)
`src/components/auth/ProfessionalRegistration.tsx`
- No `professionalPatch`: remover `approved_at` e trocar `onboarding_stage: "released"` por `"awaiting_admin"` (ou deixar o valor default do banco).
- No `activationExtras` (quando "já é coach/profissional"): remover `activation_paid_at` e `activation_source`. Manter apenas `already_coach: true` e `activation_note` como registro informativo — o admin decide se isenta ou cobra a anuidade.

### 2. Parar a auto-aprovação no server (fluxo unificado)
`src/lib/registration.server.ts` (blocos ~248–276 e ~473–487)
- Mesma mudança: não setar `approved_at`, `activation_paid_at`, `activation_source` para profissional recém-criado. `onboarding_stage` fica em estado pendente.
- Manter `is_professional: true`, `specialty_key`, dados do conselho, etc.
- `profiles.status` para novo profissional deve permanecer `pending` (não `active`) até aprovação — o `ProfessionalOnboardingGate` já cobre isso na tela do profissional.

### 3. Novo botão "Isentar anuidade" na aba de liberação
`src/routes/_authenticated/admin.professional-releases.tsx`
- Adicionar botão **Isentar anuidade** ao lado de **Conceder ativação** que chama `adminGrantProfessionalActivation` com `note: "Anuidade isenta pelo admin"`. Semanticamente idêntico ao "conceder ativação", mas rotulado de forma clara para a intenção do admin.
- Deixar o botão de "Conceder ativação" para casos em que o profissional realmente pagou por fora.

### 4. Resetar o registro do Sindscond para pendente
Migração pontual (UPDATE via insert-tool após aprovação do plano) no coach `f28ca420-5c53-4dac-89bd-199e4416a8f8`:
- `approved_at = NULL`
- `activation_paid_at = NULL`
- `activation_source = NULL`
- `onboarding_stage = 'awaiting_admin'`
- `profiles.status = 'pending'` no profile `c62a64a5-…`

Assim ele aparece imediatamente na aba pendente e o admin executa o fluxo completo (confirmar e-mail → isentar anuidade → aprovar).

### 5. Não quebrar o resto
- Coach comum (não-profissional): fluxo inalterado — auto-aprovação de coach segue igual em `registration.server.ts`.
- Parceiro: fluxo inalterado (usa `PartnerOnboardingGate`).
- Profissionais **já aprovados** antes desta mudança continuam aprovados (não mexemos em `approved_at IS NOT NULL` existentes).
- `ProfessionalOnboardingGate` já bloqueia acesso ao painel enquanto `approved_at` está nulo, então o novo profissional verá a tela "aguardando liberação" — comportamento esperado.
- Painel de aluno continua liberado pelo ajuste já feito no `SubscriptionGuard`.

## Detalhes técnicos

- Nenhuma alteração de schema, RLS ou trigger — só UPDATEs de dados no coach do Sindscond e mudança de payload nos dois pontos de criação.
- `adminGrantProfessionalActivation` valida `note` mínimo 5 chars: "Anuidade isenta pelo admin" atende.
- Após o plano ser aprovado, o UPDATE no Sindscond entra via a ferramenta de insert (mutação de dados), separado da edição de código.
