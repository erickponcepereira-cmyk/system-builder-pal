# Comissão do Hernan + dois erros no histórico de compras

## O que confirmei no banco

Pedido da Adriana (Ticket Desafio Tradicional, R$ 100,00, PIX, pago em 31/08 16:29):

- As 4 comissões desse pedido foram criadas às 16:29 **todas para o Nathan Utuari** (R$ 64,79 + 7,90 + 3,95 + 2,37), porque naquele momento ela ainda estava vinculada a ele. A troca para o **Wallace Hernan** (código 6JD45Y) aconteceu depois e **não refez as comissões** — por isso ele continua sem ver nada.
- O mesmo pedido existe em duas tabelas: o pedido da loja (`FM-CDDEA725`) e a transação financeira que aponta para ele (`store_order_id`). O histórico lista as duas → **a compra aparece duplicada**.
- O histórico de compras é o mesmo componente usado no painel do aluno e no modal do coach, sem distinção de quem está olhando → o coach vê os botões **Avaliar** e **Pedir estorno** da compra do cliente.

A comissão de R$ 179,90 fica como está, conforme combinado.

## Correção

### 1. Reconciliar a venda de R$ 100,00 para o Hernan
- Apagar as 4 comissões geradas para o Nathan nesse pedido.
- Reprocessar a transação pelo motor financeiro atual, agora com o coach correto: vendedor Wallace Hernan, rede L1/L2/L3 a partir do upline dele, master coach e taxa do sistema conforme as regras vigentes.
- Recalcular as carteiras do Nathan (para o valor sair) e do Hernan e sua linha (para entrar), mantendo a data original do pagamento para a carência de 7 dias.
- Conferir ao final que o Hernan enxerga a comissão no painel dele e que os pontos de carreira também seguiram a linha certa.

### 2. Fim da compra duplicada
No histórico unificado, quando a transação já pertence a um pedido da loja listado, ela deixa de virar um cartão próprio — fica só o pedido, que é o que tem número, itens, tickets e dias de carteirinha. Vale para todas as pessoas, não só para esse caso.

### 3. Avaliar / Pedir estorno só para o cliente
Os dois botões passam a aparecer apenas quando quem está vendo é o próprio dono da compra. No modal do coach (e em qualquer visão de terceiro) o histórico fica como consulta: mostra a nota que o cliente deu, se houver, e o status do estorno pedido por ele, sem permitir agir.

## Detalhes técnicos

- Dados: `DELETE` nas 4 linhas de `commissions` da transação `b4ede583…`, seguido de `process_paid_transaction` e `recalc_wallets_for_owner` para os coaches afetados.
- `src/lib/student-purchases.functions.ts`: descartar linhas de `transactions` cujo `metadata->>store_order_id` esteja no conjunto de `store_orders` retornado (fallback por `purchase_type = 'store_order'`).
- `src/components/student/StudentPurchaseHistory.tsx`: nova prop `somenteLeitura` (default `false`); `src/components/coach/StudentDetailsModal.tsx` passa `somenteLeitura`. Em modo leitura, os botões viram rótulos informativos.
