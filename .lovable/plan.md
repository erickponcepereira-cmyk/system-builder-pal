## Problema

- O painel do parceiro é liberado imediatamente após o cadastro: não há gate de anuidade, não há espera de aprovação do admin, não há bloqueio.
- O painel do profissional já usa `ProfessionalOnboardingGate` (Especialidade → Ativação anual → Aguardando aprovação → painel liberado). O mesmo fluxo precisa existir para o parceiro.
- A aba "Mensalidade" do parceiro hoje só tem um link externo para `/assinatura?tab=annual`. O usuário quer uma aba "Anuidade" própria ao lado de "Mensalidade".

## Escopo

### 1. `getMyPartnerOnboarding` (nova server fn em `src/lib/partner-approvals.functions.ts`)

Espelha `getMyProfessionalOnboarding`. Retorna:

```
{
  isPartner, profileId, partnerId, name, email, fantasyName,
  activationPaidAt, activationSource, approvedAt, alreadyPartner
}
```

Lê de `partners` do usuário logado.

### 2. Novo componente `src/components/partner/PartnerOnboardingGate.tsx`

Cópia estrutural de `ProfessionalOnboardingGate`:

- Carrega `getMyPartnerOnboarding` no mount.
- Realtime em `partners` (filter por `id=eq.<partnerId>`) para reagir quando o admin aprova (`approved_at`) ou concede ativação (`activation_paid_at`) — recarrega a página quando aprovar.
- Stepper com 3 passos: **Cadastro** (sempre done pois o partner já existe) → **Anuidade** (`activation_paid_at`) → **Aprovação** (`approved_at`).
- Se `!activationPaidAt`: `ActivationStep` — botão "Pagar Anuidade Parceiro" que:
  - cria `store_orders` via RPC `create_store_order` com o produto de ativação parceiro,
  - renderiza `<MercadoPagoCheckout>` para PIX,
  - também exibe botão "Já sou parceiro (avisar admin)" que chama uma nova server fn `markAlreadyPartner` (paralela à `markAlreadyCoach`) que define `activation_source='already_partner'`, `activation_paid_at=now()`, `already_partner=true` e cria uma notificação para o admin.
- Se `activationPaidAt && !approvedAt`: `WaitingApprovalStep` — mostra card "Anuidade confirmada, aguardando aprovação" com `<SubscriptionInvoicesTab walletSource="partner" />` embutido para que o parceiro já adiante mensalidade.
- Só libera `children` quando `approvedAt` está preenchido.

### 3. `markAlreadyPartner` (nova server fn)

Em `src/lib/partner-approvals.functions.ts`. Espelha `markAlreadyCoach`: marca `already_partner=true`, `activation_paid_at=now()`, `activation_source='already_partner'`, cria audit `partner_activation_paid` e notifica o admin. Não define `approved_at` — quem aprova ainda é o admin.

### 4. Produto de ativação do parceiro

Reutilizar o mesmo produto de ativação já existente para profissional (`ACTIVATION_PRODUCT_ID`) **apenas se o admin confirmar que o parceiro deve usar o mesmo SKU**. Caso contrário, criar `PARTNER_ACTIVATION_PRODUCT_ID` (constante) apontando para o produto de anuidade do parceiro já cadastrado em `products`. Este ponto precisa de decisão: ver perguntas abaixo.

### 5. `src/routes/_authenticated/partner.tsx`

- Envolver todo o painel com `<PartnerOnboardingGate>` **por fora** do `<SubscriptionGuard walletSource="partner">`, seguindo o padrão do profissional. Quando o parceiro estiver aprovado, o gate renderiza `children` e o painel funciona normalmente. Enquanto não estiver, o gate ocupa a tela inteira (sem `RoleSwitcher` para não confundir o usuário).
- Nova aba **"Anuidade"** ao lado de **"Mensalidade"** (chave `annual`). Ícone `CreditCard`. Renderiza um novo componente `PartnerAnnualTab` que:
  - chama `getMyAnnualActivation`,
  - reutiliza o mesmo cartão de estado ("Ativa até dd/mm/aaaa" / "Vencida" / "A pagar") que já é usado em `src/routes/_authenticated/assinatura.tsx` (extraír o bloco para um componente compartilhado `AnnualActivationCard` em `src/components/profile/AnnualActivationCard.tsx` para não duplicar).
  - Se estiver a pagar, mostra `MercadoPagoCheckout` para o pedido de anuidade.
- Remover o botão "Ver / pagar Anuidade" que hoje aparece dentro da aba "Mensalidade" — passa a ser redundante.

### 6. Extração de `AnnualActivationCard`

Novo `src/components/profile/AnnualActivationCard.tsx` que encapsula a UI de anuidade hoje espalhada em `assinatura.tsx`. Reaproveitado em:

- `assinatura.tsx` (aba annual atual continua funcionando via mesmo componente).
- `PartnerAnnualTab` (nova aba do painel parceiro).
- `PartnerOnboardingGate.ActivationStep` pode continuar com sua própria UI simplificada de pagamento; o card compartilhado é para painéis já aprovados.

### 7. Fluxo do parceiro admin (não muda)

`reviewPartnerStatus` / `adminApprovePartnerFinal` / `adminGrantPartnerActivation` já existem e são suficientes. Nada muda no lado admin.

## Perguntas antes de implementar

1. **Produto de ativação:** o parceiro paga o **mesmo SKU** de ativação anual que o profissional (`ACTIVATION_PRODUCT_ID`, R$ 179,90), ou existe um produto de anuidade específico do parceiro que devo usar? Se sim, qual é o `id`?
2. **"Já sou parceiro":** manter o botão "Já sou parceiro (avisar admin)" como no professional? Ele permite pular a cobrança da anuidade e avisa o admin.

## Fora de escopo

- Não altera formulário de cadastro (`registration.server.ts`) — status "pending" já é o correto.
- Não altera aprovação do admin.
- Não altera `SubscriptionGuard` nem regras de mensalidade.
- Não mexe em painel profissional (esse fluxo já está correto por indicação do usuário).

## Arquivos

- `src/lib/partner-approvals.functions.ts` — adicionar `getMyPartnerOnboarding` e `markAlreadyPartner`.
- `src/components/partner/PartnerOnboardingGate.tsx` — novo.
- `src/components/partner/PartnerAnnualTab.tsx` — novo.
- `src/components/profile/AnnualActivationCard.tsx` — novo (extraído de `assinatura.tsx`).
- `src/routes/_authenticated/partner.tsx` — envolver com gate, adicionar aba `annual`, remover botão duplicado.
- `src/routes/_authenticated/assinatura.tsx` — trocar bloco inline pela chamada de `AnnualActivationCard` (refactor, sem mudança funcional).
