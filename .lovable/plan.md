
## Diagnóstico (confirmado no banco)

Fatura da mensalidade de julho do Lucinei (`779c3d28…`, R$ 100, `payment_method='wallet'`, `wallet_source='coach'`, `status='paid'`, paga em 20/07) existe, mas:

- `wallets` do Lucinei está com `available_balance = 374.82` e `total_withdrawn = 0.00` — ou seja, os R$ 100 nunca foram descontados de fato.
- Não aparece em `withdrawal_requests`, portanto não aparece em Admin → Pagamentos, nem no histórico de saques da carteira, nem nos relatórios.

Causa raiz: `process_subscription_invoice_payment` até faz `UPDATE wallets SET available_balance = available_balance - v_debit, total_withdrawn = total_withdrawn + v_debit`, mas o motor central `recalc_wallets_for_owner` (chamado por triggers em `commissions`, `withdrawal_requests`, `partner_product_orders`, `network_unlock_history`) recomputa `available_balance` e `total_withdrawn` a partir SOMENTE de `commissions` + `withdrawal_requests`. Qualquer evento posterior sobrescreve o débito da mensalidade. Além disso, nenhuma UI de histórico/pagamentos consulta `subscription_invoices` pagas por carteira.

## O que vou implementar

### 1) Migration — tornar o débito da mensalidade a fonte de verdade

- Ampliar `recalc_wallets_for_owner` para somar, por `wallet_source` (`coach`/`partner`/`professional`), todas as `subscription_invoices` com `status='paid'` e `payment_method='wallet'` do usuário, aplicando o mesmo padrão de cascata já usado para withdrawals: cada valor é subtraído do saldo bruto do wallet de origem e somado a `total_withdrawn` daquele wallet.
- Ajustar `wallets_audit_invariant` se necessário para aceitar o novo componente.
- Backfill: rodar `recalc_wallets_for_owner` para todo profile que tem invoice paga via wallet (hoje só o Lucinei) — vai corrigir a carteira dele para o valor certo automaticamente.

### 2) Migration — histórico da carteira do coach/parceiro/profissional

Adicionar uma view ou branch nas funções que alimentam o histórico da carteira (`coach-wallet-history.functions.ts`, `PartnerWalletTab`, `ProfessionalWalletTab`) para incluir, além de comissões e saques, as linhas de `subscription_invoices` pagas por carteira como movimento tipo "Mensalidade paga com carteira" (débito), com data = `paid_at` e valor = `amount`. Feito no lado do server function (SQL), sem UI nova.

### 3) Admin → Pagamentos

Em `admin.payments.tsx`, incluir uma seção/aba (ou juntar à lista principal) mostrando `subscription_invoices` pagas via carteira, com nome/e-mail do usuário, mês de referência, valor, wallet_source, `paid_at`. Assim toda mensalidade paga com carteira interna fica visível para o admin.

### 4) Relatórios financeiros

Em `admin-financial.functions.ts` / `admin-reports.functions.ts` (onde a receita/entrada de mensalidade é apurada), garantir que as invoices pagas via wallet entrem no relatório como receita da plataforma (já entra em `admin_system_wallet_entries` como `kind='subscription'` — confirmar que o relatório lê essa fonte; se ler `transactions`, incluir também as invoices).

### 5) Sanity check pós-deploy

- Rodar `SELECT recalc_wallets_for_owner('d0f05985-…')` e confirmar que `available_balance` do Lucinei cai para R$ 274,82 e `total_withdrawn = 100,00`.
- Confirmar que o histórico da carteira dele passa a mostrar "Mensalidade 07/2026 — R$ 100,00".
- Confirmar que a fatura aparece em Admin → Pagamentos.

## Detalhes técnicos

- Toda mudança de saldo é feita via `recalc_wallets_for_owner` — não vou criar caminhos paralelos.
- O `process_subscription_invoice_payment` deixa de manipular `wallets` diretamente e passa a apenas marcar a invoice como paga + creditar `admin_system_wallet`; em seguida chama `recalc_wallets_for_owner` (main), `recalc_partner_wallet` ou `recalc_professional_wallet` conforme `wallet_source`. Isso elimina a divergência entre "débito imediato" e "recalc posterior".
- Adiciono uma trigger `AFTER UPDATE OF status ON subscription_invoices` que dispara o recalc do wallet do usuário quando a invoice vira `paid` (garante consistência mesmo se algum caminho legado marcar `paid` sem passar pela função).
- Nenhum campo público novo é exposto; nada muda para usuários que pagam por cartão/pix.
