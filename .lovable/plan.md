# Recalcular a venda "Desenvolvimento de Sistema Gago" com taxa de cartão de 9,46%

Pedido `PP-DDEB53DE` (Major Hub), pago em 03/09/2026 no cartão, valor bruto R$ 2.205,65.
Hoje a taxa de pagamento gravada é R$ 21,84 — 0,99% (tabela do PIX), não a de cartão.
A correção passa a usar 9,46% e reescreve toda a cascata desse pedido.

## Como fica a cascata

| Linha | Hoje | Depois |
|---|---|---|
| Taxa de pagamento (cartão) | 21,84 (0,99%) | 208,65 (9,46%) |
| Imposto | 0,00 | 0,00 |
| Taxa do sistema (7%) | 152,87 | 139,79 |
| Comissão do vendedor (20%) | 406,19 | 371,44 |
| Rede N1 (10% da comissão) | 40,62 | 37,14 |
| Rede N2 (5%, sem upline → vendedor) | 20,31 | 18,57 |
| Rede N3 (3%, sem upline → vendedor) | 12,19 | 11,14 |
| Líquido do vendedor | 333,07 | 304,59 |
| Líquido do parceiro (Major Hub) | 1.624,75 | 1.485,77 |
| Pontos do coach (1 pt / R$ 2 de sistema) | 76 | 69 |

Beneficiários: vendedor Ana Flávia (`f25c12d0…`), upline N1 (`0dc01639…`, comissão de rede
ainda pendente até bater a meta), parceiro Major Hub.

## O que será feito

1. Atualizar as colunas financeiras do pedido `542adbe7-9477-4fd6-9cd0-39de13aa57e0`
   (`payment_fee`, `system_fee`, `coach_commission_amount`, `network_l1/l2/l3_amount`,
   `coach_net_amount`, `partner_net_amount`), registrando em `notes`/`metadata` que a taxa
   de cartão aplicada foi 9,46%.
2. Atualizar os 4 registros em `commissions` desse pedido para os novos valores,
   preservando o status atual de cada um (3 já liberados do vendedor, 1 pendente de rede).
3. Ajustar o registro de pontos (`coach_points_log`) de 76 para 69 e recompor os totais /
   ranking / progresso de carreira do coach afetado.
4. Recalcular as carteiras dos três envolvidos (vendedor, upline N1 e parceiro) para que
   disponível, pendente e bloqueado reflitam os novos valores.
5. Conferir depois: valores do pedido, soma da cascata igual ao bruto menos taxas, e o
   extrato de cada envolvido.

## Observação

Esta correção é pontual, só deste pedido. A taxa de 9,46% não passa a valer para vendas
futuras — se ela deve virar a taxa de cartão vigente do sistema, isso é uma linha nova em
`taxas_vigentes` e precisa ser pedido separadamente.
