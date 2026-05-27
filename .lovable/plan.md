## Objetivo

Estender `/admin/financeiro` para:

1. Mostrar **Impostos** (Simples Nacional / outros) e **Taxas de pagamento** separados por método.
2. **Cartão** → baixa automática (sem botão), pois já é descontado no recebimento.
3. **PIX/boleto/outros** → botão "Pagar" que dá baixa no sistema.
4. Botões "Pagar" também nas carteiras de **Coach** e **Nutricionista**, com sincronização cruzada (pagar pelo financeiro reflete em `withdrawal_requests` e vice-versa).

---

## Mudanças de banco

### 1. Nova tabela `system_fee_payouts`
Registro de baixas manuais de taxas/impostos não-cartão.

```
id, transaction_id, kind ('tax' | 'payment_fee'),
amount, payment_method, paid_at, paid_by (admin profile), notes
```
RLS: somente admin.

### 2. Enum `nutri_block_status` ganha valor `'paid'`
Permite marcar entradas pagas sem perder histórico, mantendo carteira separada.

### 3. Função `pay_nutritionist_available(_profile_id, _admin_id, _notes)`
- Marca entradas `released` como `paid`
- Incrementa `total_withdrawn`, zera `available_balance`
- Cria registro em `withdrawal_requests` (kind=nutritionist) já como `paid` para aparecer no histórico unificado.

### 4. Função `pay_coach_available(_profile_id, _admin_id, _notes)`
- Marca comissões `available` (excluindo slot sistema/admin/nutri) como `paid`
- Cria `withdrawal_requests` `paid` para esse profile
- Recalcula `wallets` via `recalc_wallet_for_profile`

### 5. Função `pay_network_available(_profile_id, _admin_id)` — mesma lógica, mas filtra `level > 0`

---

## Server functions novas em `src/lib/admin-financial.functions.ts`

- `getFeesAndTaxesBreakdown()` → 
  ```
  { 
    tax: { total, autoPaidCard, manualPaid, manualPending },
    paymentFee: { total, autoPaidCard, manualPaid, manualPending, byMethod: [...] },
    sales: { card, pix, boleto, other }
  }
  ```
  Auto-paid = soma de transações `paid` com `payment_method='card'`. Manual paid = soma de `system_fee_payouts`. Manual pending = restante.
  
- `payManualSystemFee({ transactionId, kind })` → insere em `system_fee_payouts`.
- `payNutritionistAvailable({ profileId })`
- `payCoachAvailable({ profileId, kind: 'coach'|'network' })`

---

## UI em `/admin/financeiro`

Novo bloco **Impostos & Taxas** acima de "Custos de produtos":

```
[ Impostos (Simples, etc) ]   [ Taxas de pagamento ]
  Cartão (auto-baixa) ✓         Cartão (auto-baixa) ✓
  PIX/outros: pendente          PIX/outros: pendente
  [Listar pendentes →]          [Listar pendentes →]
```

Modal de listagem por venda com botão **"Dar baixa"** que chama `payManualSystemFee`.

Nas tabelas **Coaches** e **Nutricionistas**: nova coluna "Ações" com botão **"Pagar disponível"** (desabilitado se `available=0`). Confirma e chama a server fn correspondente.

---

## Detalhes técnicos

- Pagar pelo painel `/admin/payments` (saques) continua funcionando — a função `pay_coach_available` é idempotente e re-executável.
- Histórico de pagamentos (já existente) passa a mostrar todas as baixas, incluindo nutricionista.
- `payment_method` de transação já existe; novo card lê `payment_fee` direto da tabela `transactions` agrupado por método.

---

## Arquivos afetados

- `supabase/migrations/<novo>.sql` (tabela, enum, 3 funções RPC)
- `src/lib/admin-financial.functions.ts` (4 server fns novas)
- `src/routes/admin.financeiro.tsx` (bloco Impostos/Taxas, ações de pagar, modais)
