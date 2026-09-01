# Comissão inflada em vendas com mais de 1 unidade

## O que aconteceu (confirmado no banco)

Venda da Julia para a Janaína (31/08, 23:51, PIX, R$ 200,00 = 2 Tickets Desafio Tradicional):

```text
Bruto                      200,00
- Taxa PIX (0,99%)          -1,98
- Imposto 6%                 0,00   <-- não foi cobrado
= Base distribuída         198,02
- Sistema (valor fixo)     -20,00   <-- cobrado 1x, deveria ser 2x (uma por ativação)
Linha 1 (10%)               17,80
Linha 2 (5%)                 8,90
Linha 3 (3%)                 5,34
Comissão do vendedor       145,98
```

São duas falhas somadas:

1. **Slot de valor fixo não multiplica pela quantidade.** O produto tem o slot "Sistema" de R$ 20,00 fixo. A função de distribuição usa `gross_amount` do pedido inteiro (R$ 200) mas desconta a taxa fixa uma única vez. Em uma compra de 2 unidades, o sistema retém R$ 20 em vez de R$ 40, e a diferença cai toda no vendedor. O mesmo vale para qualquer outro slot `fixed` (ex.: "aluno indicador" R$ 40).
2. **Imposto de 6% não está sendo aplicado nas vendas da loja.** Todas as transações pagas gravam `tax_amount = 0`; a base de distribuição é `bruto - taxa de pagamento - imposto`, então com imposto zerado sobra mais para dividir. Hoje há **61 transações pagas** com produtos configurados por slots e imposto zero.

Com as duas correções, cada ativação de R$ 100 no PIX fica: 99,01 − 5,94 (imposto) − 20,00 (sistema) = 73,07 para dividir; rede leva 7,31 + 3,65 + 2,19 e o vendedor fica com **59,92** por unidade (≈ 119,84 nas duas), contra os 145,98 pagos.

Vendas com mais de 1 unidade encontradas: **3** (as duas de R$ 200 pagas em 31/08 e outra do mesmo dia). Todas do Ticket Desafio Tradicional.

## O que vai ser feito

1. **Corrigir a distribuição por quantidade** — `process_paid_transaction` passa a ler a quantidade do pedido (`store_order_items`) e multiplicar todo slot de tipo "valor fixo" por ela. Slots percentuais continuam iguais (já acompanham o valor total).
2. **Nada de imposto** — o imposto de 6% não existe mais; `tax_amount = 0` fica como está e a única correção é a da quantidade.
3. **Reprocessar as vendas afetadas** — rodar novamente a distribuição das transações com quantidade > 1 e das vendas de loja com imposto zerado, recriando comissões, taxa de sistema, pontos e entradas de rede com os valores corretos.
4. **Recalcular as carteiras** de todos os beneficiários tocados (Julia, Vimark, valdenici, Nathan e demais), incluindo saldo disponível, pendente e pontos.
5. **Relatório final** com, para cada venda corrigida: valor antigo × novo por beneficiário, e o total devolvido à carteira do sistema.

## Detalhes técnicos

- Migração alterando `public.process_paid_transaction`: novo `v_qty` = soma de `store_order_items.quantity` do `metadata->>'store_order_id'` (fallback 1); `slot_amount` para `value_type = 'fixed'` vira `value_amount * v_qty` nos dois ramos (slot solto e slot em grupo).
- Ponto de criação da transação da loja: gravar `tax_amount = round((gross - payment_fee) * imposto_pct/100, 2)` e ajustar `net_amount`, lendo `imposto_pct` de `taxas_vigentes` (mesma fonte que o front usa em `aplicarTaxasVigentes`).
- Reprocessamento via `process_paid_transaction` (já é idempotente: apaga comissões, pontos e entradas antigas antes de recriar), seguido de `recalc_wallet_for_owner` para cada beneficiário.
- Sem mudança de UI; o resumo de comissões já lê os valores gravados.

## Ponto a confirmar

Se a intenção for que o imposto de 6% **não** incida em algum produto específico (ex.: tickets de desafio), diga qual — nesse caso mantenho apenas a correção da quantidade nele.
