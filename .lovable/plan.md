## Objetivo

Permitir que, ao configurar co-produção de um produto, o criador declare um **custo** envolvido (ex.: taxa de plataforma externa, insumo, frete). O responsável designado recebe esse valor de volta em carteira (crédito com observação "Custo referente a X"), e a divisão percentual da co-produção passa a incidir sobre a base escolhida — bruto ou líquido pós-custo. Nada pode escapar de relatórios/carteiras.

## Modelo de dados (migração)

Adicionar em `public.product_coproductions`:

- `has_cost boolean not null default false`
- `cost_amount_brl numeric(12,2) not null default 0`
- `cost_bearer_type text` (`partner` | `professional`) — quem recebe o reembolso do custo
- `cost_bearer_id uuid`
- `split_base text not null default 'net'` — `'gross'` (146,71) ou `'net_after_cost'` (146,71 − custo)

Constraint: se `has_cost=true`, exigir `cost_amount_brl>0`, `cost_bearer_type/id` preenchidos.

Nova tabela `public.product_coproduction_cost_credits` (histórico auditável, análogo a `product_coproduction_credits`):

```
id, order_id, coproduction_id, bearer_type, bearer_id, amount_brl, note, created_at
```

Com GRANTs, RLS (owner do produto + bearer podem ler; service_role tudo), sem update/delete pelo usuário.

## Trigger financeiro

Atualizar `apply_coproduction_credits_on_order()`:

1. Para cada `coproduction` accepted do produto:
   - Se `has_cost` → creditar `cost_amount_brl` na carteira do `cost_bearer` (inserir em `wallets`/via mesma via já usada pelos créditos), registrar linha em `product_coproduction_cost_credits` com `note = 'Custo referente a: <product_name>'`.
2. Calcular `split_base_value`:
   - `gross` → `order.gross_amount`
   - `net_after_cost` → `order.partner_net_amount − Σ custos` (custo já saiu antes de dividir)
3. Aplicar `percent_of_net` / `fixed_amount_brl` sobre `split_base_value` (hoje usa `partner_net_amount`).
4. Descontar do criador tanto os custos quanto os splits, garantindo que a soma bata com `partner_net_amount` original (nada some, nada duplica).

`recalc_wallets_for_owner` já lê de `wallets`; incluir a nova tabela de custo como fonte no cálculo do saldo do bearer e nos relatórios (mesma trilha dos credits existentes).

## Relatórios / Carteira

- `WalletTab` (parceiro/profissional): listar entradas de custo com badge "Custo — <produto>".
- `admin.payments` / relatórios financeiros: incluir `product_coproduction_cost_credits` no somatório de repasses (mesmo padrão dos coproduction credits).
- `getWalletSplit` / `recalc_wallets_for_owner`: somar os custos ao available_balance do bearer, deduzir do criador.

## UI — `CoproductionEditor`

Novos campos no modal de convite (e edição pós-aceite se aplicável):

1. Toggle **"Existe custo neste produto?"**
2. Se sim:
   - Select **"Quem assumirá o custo?"** — criador ou o próprio coprodutor sendo convidado (dropdown com as partes já envolvidas)
   - Input **"Valor do custo (R$)"**
   - Radio **"Base do rateio percentual"**: `Bruto (R$ 146,71)` | `Líquido após custo (R$ X)`

Preview atualizado no card:

```
Bruto:               R$ 146,71
Custo (Fulano):     -R$  20,00
Base do rateio:      R$ 126,71  (net_after_cost)
Coprodutor (30%):    R$  38,01
Você fica com:       R$  88,70 + reembolso custo se você for o bearer
```

Nota mantida sobre PIX uplift.

## Ordem de execução

1. Migration: colunas + tabela + GRANTs + RLS + constraint + atualização de `apply_coproduction_credits_on_order` + inclusão nos recalculadores.
2. `src/lib/collab.functions.ts`: aceitar/retornar os novos campos em `inviteCoproducer`, `listProductCoproductions`, `updateCoproductionSplit`.
3. `CoproductionEditor.tsx`: novos campos, novo preview, submissão.
4. `WalletTab` (parceiro/profissional) + `admin.payments`: exibir custos como linha própria.
5. Verificação: query manual reproduzindo o caso 146,71 com custo 20 e 30% → conferir saldos batendo.

## Detalhes técnicos

- Todos os créditos passam pela mesma trilha (`wallets` + tabela dedicada) para o recalculador já existente somar sem duplicar.
- `product_coproduction_cost_credits` tem `UNIQUE(order_id, coproduction_id)` para idempotência (trigger roda uma vez por ordem paga).
- Sem `CHECK` com `now()` — usar trigger de validação para regras dependentes.
- GRANTs: `SELECT` para `authenticated` (filtrado por RLS), `ALL` para `service_role`.
