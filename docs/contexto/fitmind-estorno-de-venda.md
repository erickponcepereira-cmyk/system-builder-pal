---
name: fitmind-estorno-de-venda
description: "Como uma venda é desfeita no FitMind: o razão financeiro manda, a comissão vira cancelled, e o que o estorno NÃO faz"
metadata:
  node_type: memory
  type: project
---

Levantado em 22/09/2026, com clientes esperando estorno. Ver
[[fitmind-loja-unificada]] e [[fitmind-sistema-de-taxas]].

**As carteiras são derivadas, não incrementadas.** `financial_ledger_events` é
a fonte única, e `recalc_wallets_for_owner(profile_id)` reescreve `wallets`,
`partner_wallets` e `professional_wallets` a partir dela. Então **estornar não é
subtrair saldo na mão** — é desfazer o fato na origem e mandar recalcular:

- comissão vira `status='cancelled'` → o razão só lê `pending|available|withdrawn`,
  então ela some da conta de todo mundo;
- pedido de parceiro sai de `status='paid'` → junto com ele saem o **líquido do
  criador** (`partner_net_amount`) e os **créditos de co-produção**, que o razão
  monta a partir de `paid_orders`;
- nutricionista e professor têm tabela própria (`*_blocked_entries`) e função
  de cancelar (`cancel_nutritionist_blocked_entry`, `cancel_professor_blocked_entry`);
- a parte do sistema está em `admin_system_wallet_entries` e é a única que exige
  lançamento manual de débito.

**Quem já sacou fica devendo, e o sistema já sabia disso.** `wallet_statement`
calcula `available = liberado − sacado − gasto − adiantamento` e expõe o que
passou do zero como `overpaid`. Cancelar uma comissão já sacada não precisa de
carteira negativa nem de tabela nova: a dívida aparece em `overpaid` e os
próximos ganhos a cobrem sozinhos. `recalc_wallets_for_owner` nunca grava saldo
negativo — ele usa `GREATEST(...,0)` e joga a diferença em `total_withdrawn`.

**Provado em produção em 22/09/2026**, em transação desfeita, sobre a venda real
PP-9BC9995B (R$ 39,90): as 4 comissões (R$ 3,69) saíram do pendente das três
pessoas (0,37 + 3,14 + 0,18) e R$ 22,13 saíram das carteiras de parceiro
(líquido do criador + co-produção). Soma exata, nenhum resíduo.

**Armadilha do teste:** comparar carteira antes e depois **sem recalcular
antes** mede a defasagem acumulada junto com o efeito do estorno. Na primeira
tentativa o saldo do Nathan *subiu* de R$ 88,27 para R$ 177,55 — o recálculo
consertou uma defasagem que já existia. **Recalcule primeiro, tire a foto,
depois estorne.** E fica o achado: pelo menos uma carteira gravada está
defasada em produção; existem `admin_reconcile_all_wallets` e `auditar_carteiras`
para isso, ainda não rodados.

## O que a tela faz desde 22/09/2026

`return_requests` existia desde julho com a RLS pronta (o aluno cria, vê e
cancela o próprio; o admin gerencia) e as telas existiam desde 29/08 — mas **o
único caminho até elas era rolar a loja até o fim**, e só enquanto a loja
estivesse no modo vitrine. Por isso "não aparecia". Agora há card na home do
aluno e item em Perfil › Conta.

A decisão do admin virou dois passos, escolha do Erick: **Aprovar autoriza,
"Estornar e retirar comissões" executa**. O botão de estornar só acende depois
de aprovado, e chama `executarEstorno` (`src/lib/refunds.functions.ts`), que é
server fn com `requireSupabaseAuth` e confere `role='admin'`. Estorno parcial
não muda a comissão: a venda deixou de valer, e a comissão sai inteira.

## O que o estorno NÃO faz

- **Não devolve o dinheiro ao cliente.** Não há chamada de estorno no Mercado
  Pago. A devolução é por fora (Pix, maquininha) e o botão só registra que ela
  aconteceu — é por isso que aprovar e estornar são dois passos.
- **Ticket de desafio já usado em inscrição não volta.** O que está livre é
  revogado; o consumido fica, e a tela avisa quantos foram.
- **Não mexe em fitcoin de indicação já creditado** (`is_referral`), além de
  cancelar a comissão correspondente.

## O pedido nunca chegava a ser criado (22/09/2026)

`return_requests` tinha **zero linhas** desde julho, e o motivo não era falta de
tela: `getStudentPurchaseHistory` prefixa o id de cada linha do histórico
(`tx-`, `order-`, `pp-`) porque as quatro origens são tabelas diferentes e podem
repetir uuid. O formulário mandava esse texto para `return_requests.order_id`,
que é **uuid** — e o banco recusava com `22P02 invalid input syntax for type
uuid`. O `catch` genérico virava "Não consegui enviar seu pedido agora, tente de
novo em instantes", então ninguém nunca soube por quê.

`product_reviews.order_id` é uuid pelo mesmo motivo e recebia o mesmo prefixo:
**"Avaliar" falhava calado desde 29/08** pela mesma causa, e o mapa de
avaliações — indexado pelo uuid cru — nunca casava com a linha da tela.

`idDoPedido` e `tipoDoPedido` (`src/lib/store-returns.ts`) fazem a tradução num
lugar só. O prefixo também é quem sabe a tabela de verdade: `source` não
distingue assinatura (que é `transactions`) de pedido da loja, e por isso
`tipoDoPedido` passou a receber o id da linha.

**A lição, que vale para o resto do app:** id de lista unificada não é id de
tabela. Onde o histórico junta origens diferentes, o id ganha prefixo — e todo
`insert` que o usa precisa desfazer isso.

Provado em produção, em transação desfeita, com o JWT de uma aluna real: com o
prefixo, `22P02`; sem ele, o pedido é criado e o gatilho
`sync_release_status_from_returns` já põe o repasse do pedido em `blocked`.
