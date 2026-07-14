## Diagnóstico

Ana Flávia tem 3 valores diferentes de "disponível" no sistema, todos calculados por lógicas independentes:

| Fonte | Valor hoje | Como calcula |
|---|---|---|
| `wallets.available_balance` (DB, via trigger `recalc_wallet_for_profile`) | **R$ 28,70** | comissões liberadas − saques ativos − saques pagos |
| `getWalletSplit` (server fn que a Carteira do coach usa) | **R$ 24,11** | recalcula tudo de novo a partir de `commissions`, mas com regras ligeiramente diferentes (dedupe, deduções, quebra direta/rede) |
| Admin → Pagamentos → detalhe da Ana | **R$ 0,00** | quando abre como "aluno indicador" lê `student_wallets.available_balance` (=0), mesmo já sendo coach com saldo real |

Além disso `getPayoutDetails` mistura fontes quando o grupo é `student_referrer`: mostra disponível=0 (student_wallet) mas total sacado=R$50,56 (que é do wallet de coach). E `getWalletSplit` computa `direct.available` de forma incompatível com o trigger do banco.

## Correções

### 1. `getWalletSplit` passa a usar `wallets` como fonte de verdade

`src/lib/network-unlock.functions.ts`:
- Ler `wallets.available_balance` e `wallets.pending_balance` do perfil.
- Continuar classificando comissões em direta vs rede apenas para o **display do split** (quanto do disponível é direta, quanto é rede), respeitando o unlock mensal.
- `withdrawable = wallets.available_balance` (idêntico ao que o trigger e o admin usam).
- Manter dedução de saques ativos apenas para consistência, mas usando o mesmo filtro do trigger (`requested|approved|processing|paid`) — na prática o `wallets.available_balance` já vem líquido, então não deduzir de novo.

### 2. `getPayoutDetails` deixa de misturar fontes

`src/lib/admin-payouts.functions.ts`:
- **Grupo `seller`**: comissões filtradas por `is_referral != true`, saques só de `withdrawal_requests`, disponível/sacado só das wallets de vendedor (`wallets`+`partner_wallets`+`professional_wallets`+`nutritionist_wallets`).
- **Grupo `student_referrer`**: comissões filtradas por `is_referral = true`, saques só de `student_withdrawal_requests`, disponível/sacado só de `student_wallets`, total ganho/bloqueado calculado só sobre comissões `is_referral=true`.
- Elimina o caso em que a Ana aparece como aluno indicador mostrando R$50,56 de sacado que na verdade é do canal coach.

### 3. `listPendingWithdrawals` mostra a Ana no grupo coach corretamente

`src/lib/admin-payouts.functions.ts` (função `listPendingWithdrawals`):
- Se o perfil é seller (coach/parceiro/profissional) **e** aluno indicador, ele aparece só no grupo `seller` com os números do wallet de coach.
- Só aparece em `student_referrer` quem é exclusivamente indicador (sem role de seller).
- Corrige a linha "Ana Flávia Lucas — R$ 0,00" na aba de indicadores.

### 4. Migration de reforço (opcional, só se `wallets.available_balance` estiver errado)

Rodar uma vez `PERFORM recalc_wallet_for_profile(...)` para todos os perfis com comissões, garantindo que a carteira reflete a lógica atual do trigger. Não altera schema.

## Detalhes técnicos

- Arquivos alterados: `src/lib/network-unlock.functions.ts`, `src/lib/admin-payouts.functions.ts`.
- Nenhuma mudança de schema.
- WalletTab do coach continua chamando `getWalletSplit` sem alteração — só o número muda (passa a bater com o admin).
- Admin/pagamentos passa a mostrar Ana no grupo Coach com R$ 28,70 disponível, R$ 50,56 sacado, e não duplicar no grupo aluno indicador.
