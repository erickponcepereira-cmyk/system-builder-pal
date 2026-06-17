# Mensalidade Recorrente — Coach/Parceiro/Profissional

## Regra de negócio

- Valor padrão global: **R$ 100/mês** (configurável em Admin → Configurações).
- Uma única mensalidade por pessoa, mesmo que acumule papéis (coach + parceiro + profissional).
- Override por usuário: valor custom ou isenção (mês específico, anual, ou permanente).
- Dia de vencimento escolhido pelo usuário no cadastro (1–28). Editável depois pelo admin.
- D-0: notificação "fatura vence hoje". D+1..D+3: lembretes diários. **D+4: bloqueio do painel** (login permitido apenas para `/perfil/faturas` para quitar).
- 100% do valor pago vai para a **carteira do Admin (taxa de sistema)**. Descontam-se apenas taxa de máquina (PIX/cartão, se aplicável) e imposto (Simples 6%). Pagamento via saldo interno não tem taxa de máquina.

## Métodos de pagamento (na aba "Minhas Faturas" do perfil)

1. **PIX/Cartão** via Mercado Pago (mesma integração já existente).
2. **Débito automático** (cartão salvo — usa `saved_payment_cards` + MP recorrente).
3. **Descontar da carteira interna** (debita da `wallets`/`partner_wallets`/`professional_wallets` conforme papel; transfere para `admin_system_wallet`).

## Schema (nova migração)

Novas tabelas:
- `subscription_plans` — id, nome, valor_padrão, ativo. Seed: plano "Mensalidade FitMind R$100".
- `user_subscriptions` — user_id (auth.users), plan_id, custom_amount (nullable, override), billing_day (1–28), start_date, status (`active|exempt_monthly|exempt_annual|exempt_permanent|cancelled`), exempt_until (date, nullable), preferred_payment_method (`pix|card|auto_debit|wallet`), saved_card_id (nullable), created_at.
- `subscription_invoices` — id, user_subscription_id, user_id, reference_month (date, dia 1), due_date, amount, fee_amount, tax_amount, net_to_admin, status (`pending|paid|exempted|overdue|blocked`), paid_at, payment_method, mp_payment_id, wallet_source (`coach|partner|professional|external`), created_at.
- `subscription_payment_log` — auditoria de tentativas/admin overrides.

RLS:
- Usuário lê/edita sua própria `user_subscriptions` (campos limitados: billing_day, preferred_payment_method, saved_card_id).
- Usuário lê suas `subscription_invoices`.
- Admin (`has_role admin`) faz tudo.
- GRANT padrão authenticated + service_role.

Funções SQL:
- `ensure_user_subscription(user_id, billing_day)` — chamada no cadastro de coach/parceiro/profissional; cria uma única assinatura por user_id.
- `generate_monthly_invoices()` — gera faturas do mês para todos os ativos (respeita `start_date` e `billing_day`). Idempotente por (user_subscription_id, reference_month).
- `mark_overdue_invoices()` — atualiza `pending` → `overdue` após D+1 e → `blocked` após D+3.
- `process_invoice_payment(invoice_id, method, source_wallet)` — debita carteira interna ou registra pagamento externo, credita `admin_system_wallet`, gera entrada em `admin_system_wallet_entries` com slot "Mensalidade", lança imposto via `system_fee_payouts` (mesmo padrão usado em `process_partner_product_order_paid`).
- `is_user_blocked_by_subscription(user_id)` — boolean, usado pelo guard de UI.

Cron (pg_cron + pg_net → `/api/public/hooks/subscriptions-tick`):
- Diariamente 03:00: `generate_monthly_invoices()` + `mark_overdue_invoices()` + tentativa de débito automático para quem escolheu `auto_debit`/`wallet`.

## Integração financeira (sem quebrar relatórios existentes)

- Toda fatura paga gera entrada em `admin_system_wallet_entries` com `slot_label = 'Mensalidade Recorrente'` e referência `subscription_invoice_id` (nova coluna nullable).
- Reaproveita `isAdminSystemSlot` em `src/lib/admin-financial.functions.ts` — adicionar "mensalidade" à lista de slots de sistema (entra no saldo do admin, igual taxa).
- `admin.financeiro.tsx` e `admin.payments.tsx`: nova seção/filtro "Mensalidades" listando as faturas (já aparece automaticamente no total porque entra como entry).
- `system_fee_payouts`: ganha coluna `subscription_invoice_id` para baixa manual via aba existente.

## UI

### Perfil do usuário (`/perfil` ou similar para cada papel)
Nova aba **"Minhas Faturas"** (`PaymentsTab.tsx` compartilhado):
- Card "Próxima fatura" (mês corrente): valor, vencimento, status.
- Botões: Pagar com PIX, Cartão, Débito automático (ativa/desativa), Descontar do saldo.
- Histórico das faturas anteriores.
- Aviso vermelho se em atraso/bloqueio.

### Cadastro (CoachRegistration, PartnerRegistration, ProfessionalRegistration)
- Campo "Melhor dia do mês para a mensalidade" (1–28). Se já existe assinatura ao virar outro papel, reusa.

### Admin
Nova rota **`/admin/mensalidades`** (`admin.subscriptions.tsx`):
- Lista de assinaturas: usuário, papéis, valor efetivo, vencimento, status, última fatura.
- Ações por linha: alterar valor, isentar (mês/ano/permanente), alterar dia de vencimento, cancelar.
- Aba "Faturas": filtros por mês/status, ação "marcar como paga manualmente", "estornar".
- Aba "Configurações": valor padrão global, dias de carência antes de bloquear (default 3).

### Guard de bloqueio
- Hook `useSubscriptionStatus()` consultando `is_user_blocked_by_subscription`.
- Layout `_authenticated/route.tsx` (ou wrapper de coach/partner/professional): se bloqueado e rota ≠ `/perfil/faturas`, exibe overlay "Mensalidade em atraso — quite para liberar".

## Arquivos

**Migration:** `supabase/migrations/<ts>_subscriptions.sql` — tabelas, RLS, GRANTs, funções, seed do plano padrão, coluna `subscription_invoice_id` em `admin_system_wallet_entries` e `system_fee_payouts`.

**Server fns** (`src/lib/`):
- `subscriptions.functions.ts` — `getMySubscription`, `getMyInvoices`, `updateBillingDay`, `setPreferredPaymentMethod`, `payInvoiceWithWallet`, `createInvoiceMPCheckout`.
- `admin-subscriptions.functions.ts` — `listSubscriptions`, `listInvoices`, `setCustomAmount`, `grantExemption`, `markInvoicePaid`, `updateGlobalAmount`.

**Cron route:** `src/routes/api/public/hooks/subscriptions-tick.ts`.

**Componentes:**
- `src/components/profile/SubscriptionInvoicesTab.tsx` (reutilizado em coach/partner/professional).
- `src/components/admin/SubscriptionsManager.tsx`.
- `src/routes/admin.subscriptions.tsx`.

**Edits:**
- Adicionar campo `billing_day` nos 3 forms de registro + chamada a `ensure_user_subscription`.
- `src/lib/admin-financial.functions.ts` — incluir slot "mensalidade" como sistema.
- `src/routes/admin.financeiro.tsx` e `admin.payments.tsx` — incluir faturas no agregado.
- Sidebar admin: link "Mensalidades".
- Guard de bloqueio no layout autenticado.

## Considerações

- Mensalidade idempotente: única por user_id (não por papel), garantida por UNIQUE(user_id) em `user_subscriptions`.
- Pagamento via carteira: se saldo insuficiente, mostra erro e oferece PIX/cartão.
- Débito automático: tentativa diária no vencimento; falhas viram `pending` (segue fluxo de bloqueio).
- Isenção anual: `exempt_until = vencimento + 12 meses`, ignora geração de faturas no período.
- Membros do conselho = `status = 'exempt_permanent'`.