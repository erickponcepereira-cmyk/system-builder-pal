# Corrigir data de venda nos relatórios (adesão da Katyerly aparecendo hoje)

## O que aconteceu

A adesão da Katyerly (pedido FM-8298F056, R$ 179,90) foi paga em **31/08/2026 22:45**. Confirmado no banco:

- transação: `paid_at = 31/08 22:45`
- comissões da Suellyn (R$ 72,34 + R$ 2,65): `created_at = 31/08 22:45`
- pontos do coach: `created_at = 31/08 22:45`

Por isso carteira e pontos do desafio estão certos.

O relatório de vendas do coach, porém, **não usa a data de pagamento do pedido da loja**: ele usa `store_orders.updated_at` como se fosse a data da venda (filtro e coluna exibida). Ontem/hoje esse pedido foi tocado pela correção de forma de pagamento (o backfill do cartão x Pix), o que mudou o `updated_at` para **02/09 18:23** — e a venda "pulou" para hoje.

Ou seja: qualquer alteração administrativa no pedido (correção de método, envio, status de entrega, reconciliação) reescreve a data que o relatório mostra.

A coluna correta já existe: `store_orders.paid_at`. Só que ela está preenchida em apenas **17 de 177** pedidos pagos — por isso o código acabou usando `updated_at` como muleta. Em `partner_product_orders` o `paid_at` está 100% preenchido e esses relatórios não têm o problema.

## Correção

1. **Backfill de `store_orders.paid_at`** para os 160 pedidos pagos sem a data, na seguinte ordem de prioridade:
   - data de aprovação do pagamento no Mercado Pago (`mercadopago_payments`);
   - `paid_at` da transação espelho do pedido;
   - `created_at` do pedido (último recurso).
2. **Garantir preenchimento daqui em diante**: a rotina que marca o pedido como pago passa a gravar `paid_at` sempre (e a não sobrescrevê-lo depois).
3. **Trocar a fonte da data nos relatórios** de `updated_at` para `coalesce(paid_at, created_at)`, tanto no filtro do período quanto na coluna exibida:
   - `src/lib/coach-reports.functions.ts` (relatório de vendas do coach — o caso da Suellyn);
   - `src/lib/network-ranking.functions.ts` (ranking por período);
   - `src/lib/coach-profile-summary.functions.ts` (resumo do coach);
   - `src/lib/coach-attendance.functions.ts` (última compra / histórico do aluno).
4. **Auditoria dos demais relatórios**: revisar as telas de admin que listam pedidos da loja (`admin.store-reports`, `admin.reports`, `admin.orders`) e `coach-sales` / `coach-downline` / `coach-career`, confirmando que nenhuma usa `updated_at` como data de venda. Onde usar, aplicar a mesma troca.

## Verificação

- FM-8298F056 volta a aparecer em **31/08** no relatório da Suellyn, e some do período de setembro.
- Conferir que o total de vendas de agosto do coach volta a bater com o valor de comissões de agosto.
- Conferir uma amostra dos outros 15 pedidos que sofreram o backfill de forma de pagamento (todos tiveram `updated_at` alterado em 02/09) — todos devem voltar para o mês original.
- `node node_modules/typescript/bin/tsc --noEmit` sem regressão sobre a linha de base de 15 erros.

## Observação

Nenhum valor financeiro muda: é só a data exibida/filtrada. Carteiras, comissões e pontos permanecem como estão.
