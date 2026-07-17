## Diagnóstico — Ana Flávia Lucas (profile `7deffbca-…f7d`)

### Números reais no banco (medidos agora)

**Comissões (`commissions` where beneficiary_profile_id = Ana):**


| Categoria                                     | Status      | Valor         |
| --------------------------------------------- | ----------- | ------------- |
| Vendas próprias (level 0, não referral)       | available   | R$ 145,18     |
| Master coach (level 0, is_master=true)        | available   | R$ 19,95      |
| Rede/upline nível 1                           | available   | R$ 21,44      |
| Rede/upline nível 2                           | available   | R$ 0,04       |
| Rede/upline nível 3                           | available   | R$ 0,01       |
| Referral de aluna (level 0, is_referral=true) | **pending** | R$ 40,00      |
| **Total comissões**                           | &nbsp;      | **R$ 226,62** |


**Ganhos como criadora (`partner_product_orders` status=paid, +7 dias):**

- Como parceira: 5 pedidos × R$ 0,70 = R$ 3,50 (liberado)
- Como profissional: 4 pedidos × R$ 0,62 = R$ 2,48 (liberado)
- **Total criadora: R$ 5,98**

**Saques (`withdrawal_requests`):**

- Pago: R$ 50,56 (13/07)
- Solicitado/reservado: R$ 114,00 (17/07)
- Rejeitado: R$ 50,52 (ignorado)

### Cálculo correto do saldo (líquido)

- Ganho liberado hoje = 165,13 (vendas próprias+master) + 5,98 (criadora) = **R$ 171,11**
- Ganho bloqueado hoje = 21,49 (rede — missão do mês não batida) + 40,00 (referral pendente) = **R$ 61,49**
- Saques (pago + reservado) = 50,56 + 114,00 = **R$ 164,56** 
- **Disponível real = 171,11 − 164,56 = R$ 6,55** (o admin mostra R$ 6,63, diferença de centavos por arredondamento)
- **Bloqueado real = R$ 61,49**
- **Já sacado = R$ 50,56**
- **Total ganho = R$ 232,60**

### Divergências entre telas


| Fonte                      | Disponível | Bloqueado | Total ganho | Sacado    |
| -------------------------- | ---------- | --------- | ----------- | --------- |
| **Valor correto**          | **6,55**   | **61,49** | **232,60**  | **50,56** |
| Admin/Pagamentos           | 6,63       | 0,00 ❌    | 232,60      | 50,56     |
| Carteira do coach (painel) | 0,65 ❌     | 21,41 ❌   | 186,62 ❌    | 50,56     |
| `wallets` (tabela DB)      | 0,65       | 21,41     | 186,62      | 50,56     |
| `partner_wallets`          | 0,00 ❌     | 3,50      | 3,50        | 0         |
| `professional_wallets`     | 0,00 ❌     | 2,48      | 2,48        | 0         |


### Causas raiz

1. `**wallets` ignora ganhos de criadora de produtos.** O trigger `recalc_wallet_for_profile` só soma `commissions`; nunca inclui `partner_product_orders.partner_net_amount`. Por isso o painel do coach (que lê `wallets.available_balance`) mostra R$ 0,65 em vez de R$ 6,55.
2. `**partner_wallets` / `professional_wallets` não são atualizadas.** Os ganhos de criadora ficam eternamente com `available_balance=0` mesmo depois dos 7 dias. Não existe trigger/cron para liberar. O admin compensa recalculando on-the-fly (`cre.available`), então o admin bate, mas o painel do parceiro/profissional não.
3. **Bloqueado do admin fica em R$ 0,00.** `aggregateCommissionsBy` no grupo "seller" não soma:
  - Comissões `status=pending` (referral R$ 40,00 desse caso), porque roteiam pelo grupo `student_referrer`; mas a Ana também é seller e o valor some da view dela.
  - Comissões de rede `status=available` cujo mês tem missão não batida (R$ 21,49). O admin não conhece a regra de "network locked".
4. **Sem "fonte única" real.** Hoje temos 4 fontes calculando o mesmo saldo com regras diferentes:
  - Trigger `recalc_wallet_for_profile` (só commissions) → grava `wallets`
  - `getWalletSplit` (lê `wallets` + reconciliação por classificação) → painel coach
  - `listPayoutPeople` (soma `wallets + partner_wallets + professional_wallets + nutritionist_wallets + creator on-the-fly`) → admin
  - `PartnerWalletTab`/`ProfessionalWalletTab` (lê `partner_wallets`/`professional_wallets` puros) → painéis específicos

## Plano de correção

### Objetivo

Uma única função `recalc_wallet_for_profile(profile_id)` que reconcilia TODAS as fontes de ganho e escreve o resultado em `wallets` (seller) + `partner_wallets` + `professional_wallets`. Todo mundo lê dessas tabelas — ninguém recalcula on-the-fly.

### Passos

**1. Migração SQL — reescrever `recalc_wallet_for_profile**`

Para cada profile, calcular:

- `direct_available` = comissões (level=0, is_referral=false, status=available OU (pending com available_at ≤ now))
- `network_pending` = comissões (level>0) — sempre pendente, exceto quando a snapshot mensal do mês da comissão tem `any_completed=true`
- `referral_pending` = comissões (is_referral=true, status=pending)
- `creator_available` = SUM(partner_product_orders.partner_net_amount) WHERE status='paid' AND paid_at ≤ now − 7 dias, para os partner_id/professional_coach_id do profile
- `creator_pending` = mesmo SUM sem a regra dos 7 dias

Reservado por saques em aberto = SUM(withdrawal_requests.amount WHERE status IN ('requested','approved','processing')).

Escrever:

- `wallets`: available = (direct_available + creator_available_da_parte_seller) − total_withdrawn − reservado; pending = network_pending + referral_pending; total_earned = tudo somado.
- `partner_wallets`: só a parte de partner_product_orders vinculada ao `partner_id` (available/pending).
- `professional_wallets`: só a parte vinculada ao `professional_coach_id` (available/pending).

Adicionar triggers em `partner_product_orders` (INSERT/UPDATE de status ou paid_at) e em `withdrawal_requests` para chamar o recalc automaticamente.

**2. Remover recálculo on-the-fly do admin**

`src/lib/admin-payouts.functions.ts`:

- `listPayoutPeople` passa a ler apenas `wallets`, `partner_wallets`, `professional_wallets`, `nutritionist_wallets` + `student_wallets` (para o grupo student_referrer). Sem `creatorAgg`, sem `commAgg` para blocked.
- `blocked` vem de `wallets.pending_balance + partner_wallets.pending_balance + professional_wallets.pending_balance`.
- `getPayoutDetails` idem.

**3. Simplificar `getWalletSplit**`

`src/lib/network-unlock.functions.ts`:

- Ler `wallets` + `partner_wallets` + `professional_wallets` do profile.
- `withdrawable = wallets.available + partner_wallets.available + professional_wallets.available`.
- Split direct/network apenas para exibição (a partir das próprias comissões, como já faz).

**4. `PartnerWalletTab` / `ProfessionalWalletTab**`

Sem mudança de lógica — já leem as tabelas certas. Só passarão a mostrar valores corretos depois do recalc.

**5. Backfill**

Ao aplicar a migração, rodar `recalc_wallet_for_profile` para todos os profiles com saldo/comissão/saque.

**6. Reconciliar Ana manualmente**

Após o backfill os números da Ana ficarão:

- Carteira coach: R$ 6,55 disponível, R$ 61,49 bloqueado, R$ 232,60 total, R$ 50,56 sacado.
- Partner wallet: R$ 3,50 disponível.
- Professional wallet: R$ 2,48 disponível.
- Admin/Pagamentos: mesmos valores.

O saque atual de R$ 114,00 fica com o saldo insuficiente exposto (ela vai precisar cancelar e refazer com R$ 6,55, ou esperar liberar rede/referral). Deixarei o saque como está — cancelar é decisão dela.

### Arquivos afetados

- Nova migração SQL (recalc + triggers + backfill).
- `src/lib/admin-payouts.functions.ts` (remover cálculo on-the-fly).
- `src/lib/network-unlock.functions.ts` (simplificar getWalletSplit para somar as 3 wallets).

### Detalhes técnicos

- Regra "network locked" continua consultando `network_unlock_history.any_completed` por mês da comissão. Mês corrente usa snapshot vivo (`computeMonthlySnapshot`).
- `is_test` das wallets: recalc respeita se o profile é de teste (matching test_accounts).
- Recalc idempotente e barato (≤ 6 queries por profile).