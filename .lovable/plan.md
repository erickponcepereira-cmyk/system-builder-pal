## 1. Débito de R$100 da carteira (mensalidade) — validação
Já verificado no banco:
- `subscription_invoices` id `779c3d28…` da Ana está `paid`, `payment_method=wallet`, `wallet_source=coach`, `paid_at=2026-07-20`.
- `subscription_payment_log` tem entrada `paid` com `{amount:100, method:wallet, wallet_source:coach}`.
- `wallets.available_balance` = 304,58 e o histórico da carteira mostra "Mensalidade paga com carteira −R$100,00".

Conclusão: o débito **funcionou**. Não há mudança de código nessa parte, apenas confirmação.

## 2. Pagamento com carteira interna na loja (todas as carteiras somadas)
Escopo: permitir que aluno/coach pague pedidos de `store_products`, `partner_products`, `professional_products` e `digital_products` usando saldo interno, debitando na ordem **coach → parceiro → profissional** até cobrir o valor total.

Alterações:
- **Migração**: nova função `process_store_order_wallet_payment(_order_id, _user_id)`:
  - lê saldos das três carteiras (`wallets`, `partner_wallets`, `professional_wallets`) via `profile_id`;
  - valida `soma >= total`;
  - debita em cascata (coach → parceiro → profissional), registrando cada débito como entrada negativa (nova coluna/entrada em `fitcoin_ledger` ou tabela equivalente `wallet_debits` referenciando `order_id`);
  - marca o pedido como pago (`status=paid`, `payment_method=wallet`, `wallet_debit_breakdown jsonb`);
  - dispara o mesmo fluxo pós-pagamento que MP (commissions, coprodução, subscription perks quando aplicável) — reusando `settle_partner_product_order` / equivalente já existente.
- **Schema**: adicionar em `partner_product_orders` e `store_orders` colunas `payment_method text` (se ainda não existir uniformizado) e `wallet_debit_breakdown jsonb` para relatórios.
- **UI de checkout** (`ProductDetailModal`, `StorePage`, `PartnerProfessionalStore`, checkout de `digital_products`):
  - novo botão "Pagar com carteira interna (saldo disponível: R$X,XX)" ao lado de PIX/Cartão;
  - mostra breakdown (coach R$…, parceiro R$…, profissional R$…) antes de confirmar;
  - desabilita se soma < total, com CTA para escolher outro método.
- **Server function** `payOrderWithWallet({ order_id })` em `src/lib/store-orders.functions.ts` (nova) chamando a RPC.

## 3. Relatórios mostrando origem "carteira interna"
- Admin `admin.payments.tsx`: adicionar filtro/coluna "Método = Carteira" e exibir breakdown (coach/parceiro/profissional) na linha da transação.
- `WalletTab.tsx` e histórico da carteira: cada débito da loja aparece como "Compra na loja — {produto} (−R$X,XX)" com link para o pedido.
- `getPartnerReports` / `admin-financial.functions.ts`: incluir `payment_method='wallet'` nas agregações (hoje só soma MP), separando "Recebido em dinheiro" vs "Pago com carteira".
- Recibo do pedido: quando `payment_method=wallet`, imprime "Pago com carteira interna" e breakdown.

## 4. Modais do admin fora da tela — correção global
Ajustar `src/components/ui/dialog.tsx` (`DialogContent`) para responsividade mobile:
- trocar largura fixa por `w-[calc(100%-1rem)] max-w-lg`;
- limitar altura: `max-h-[calc(100dvh-2rem)] overflow-y-auto`;
- posicionamento seguro: manter centralização mas com `max-h`;
- adicionar `sm:max-w-lg` e classes fluidas.

Isso corrige todos os modais admin (`AdminShell`, `ProductReviewModal`, `PartnerDetailsModal`, etc.) de uma só vez sem tocar cada um.

## Detalhes técnicos
- Ordem de execução: (a) migração RPC + colunas; (b) `store-orders.functions.ts`; (c) UI de checkout; (d) relatórios; (e) fix de `dialog.tsx`.
- Reutilizar `recalc_wallets_for_owner` após cada débito para manter `available_balance` consistente.
- Idempotência: RPC usa `SELECT … FOR UPDATE` nas 3 carteiras + verifica `payment_method IS NULL` no pedido antes de debitar.
- Sem mudança no fluxo de mensalidade (já funcional).
