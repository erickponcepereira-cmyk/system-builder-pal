# Acertar a carteira da Ana Flávia e o saldo divergente na aba Pagamentos

## O que eu conferi no banco (caso Ana Flávia)

| Item | Valor |
|---|---|
| Comissões liberadas (fora rede) | R$ 675,73 |
| Comissões de rede liberadas (bloqueadas por missão) | R$ 143,15 |
| Comissões em carência | R$ 470,12 |
| Já sacado na carteira de coach | R$ 826,63 |
| Carteira de parceiro: ganho 568,64 − sacado 371,30 − carência 146,16 | R$ 51,18 |
| Carteira de profissional | R$ 2,48 |
| Adiantamento registrado | R$ 45,98 (marcado como quitado) |

O saque manual de **R$ 300,00 foi pago sim** (01/09 00:33) e baixou o total sacado — hoje o total pago em saques dela é R$ 1.197,93, que bate com a soma das carteiras.

## Os dois problemas confirmados

1. **Saldo negativo escondido.** Na carteira de coach ela já sacou R$ 826,63 contra R$ 675,73 liberados — ou seja, R$ 150,90 pagos a mais. A tabela guarda esse saldo como R$ 0,00 em vez de negativo, então o excesso "some" e o disponível fica inflado. O correto hoje é **R$ 0,00 disponível**, com ~R$ 97 ainda a compensar nas próximas liberações.
2. **Duas contas diferentes na tela.** A lista da aba Pagamentos soma direto as carteiras (0 + 51,18 + 2,48 = **R$ 53,66**) e o modal usa o extrato consolidado, que ainda desconta o adiantamento de R$ 45,98 (**R$ 7,68**). Além disso o adiantamento continua sendo descontado mesmo já marcado como quitado — desconto em dobro do mesmo dinheiro.

## Correção

1. **Um único cálculo de "disponível"**: o extrato passa a consolidar coach + parceiro + profissional permitindo saldo negativo entre elas (o excesso de uma abate a outra) e só zera no total. Passa a mostrar a linha "Já pago acima do liberado (a compensar)" com o valor real, calculado dos saques efetivamente pagos — não mais de um lançamento manual.
2. **Aposentar o adiantamento manual**: como o excesso passa a ser calculado sozinho, o lançamento de R$ 45,98 da Ana é zerado (era o mesmo dinheiro do excesso) e a linha "Adiantamento" só aparece quando houver lançamento em aberto de verdade.
3. **Mesma fonte nas duas telas**: a lista de pessoas em Pagamentos passa a usar o mesmo extrato consolidado do modal, para lista e modal mostrarem sempre o mesmo número (no caso dela, R$ 0,00 em ambos).
4. **Revisão geral**: rodar a reconciliação de todas as carteiras e listar todo mundo que está com saque pago acima do liberado (mesma falha da Ana), com o valor a compensar de cada um, para conferência no admin.

## Como conferir

- Abrir Ana Flávia: lista e modal com o mesmo disponível (R$ 0,00), a compensar ~R$ 97, carência R$ 608,53, rede bloqueada R$ 143,15, já pago R$ 1.197,93, sem linha de adiantamento.
- Conferir mais duas pessoas (um coach puro e um parceiro) e o relatório de excesso.

## Detalhes técnicos

- Migração alterando `public.wallet_statement`: `v_base_avail` deixa de usar saldos já clampados e passa a `liberado_total − sacado_pago − saque_em_aberto` por origem, somando entre carteiras antes do `GREATEST(...,0)`; novos campos `overpaid` e `available_before_advance`; adiantamento deixa de subtrair `advance_amount` e passa a subtrair só `advance_open`.
- `recalc_wallet_for_owner` grava o excesso em vez de zerar silenciosamente (campo de excesso na carteira ou log), mantendo o disponível nunca negativo na tabela.
- `listPayoutPeople` e `getPayoutsDashboard` em `src/lib/admin-payouts.functions.ts` passam a ler `wallet_statement` por pessoa (batch) em vez de somar `wallets`/`partner_wallets`/`professional_wallets`.
- `WalletStatementCard.tsx`: linha de adiantamento condicionada a `advanceOpen > 0`; nova linha "Já pago acima do liberado".
- Dado: `update wallet_advances set amount = 0` (ou remoção) do lançamento da Ana, e reconciliação em massa com log.
