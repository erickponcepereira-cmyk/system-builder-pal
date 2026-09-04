# Antecipação para co-produtor e saldo devedor após recálculo

## O que eu confirmei no banco

**1. A venda não aparece para o Hernan porque a antecipação ignora co-produção.**
O pedido `PP-DDEB53DE` está pago em 03/09, com carência de 7 dias (libera em 10/09).
O crédito do Hernan (HDSoluções, R$ 742,89) está gravado em co-produção, e não como
"parceiro do pedido" — o parceiro do pedido é a Major Hub.

- A lista de antecipação de comissões só enxerga lançamentos de comissão.
- A lista de antecipação de venda de produto só procura pedidos onde a pessoa é o
  parceiro/profissional dono do pedido. O co-produtor nunca casa nessa busca.
- Resultado: a Major Hub vê a venda inteira (R$ 1.485,77) e o Hernan não vê nada,
  mesmo com o valor dele em carência na carteira.

**2. Ana Flávia ficou devendo, mas a carteira mostra zero.**
Saques pagos somam R$ 2.487,73 e o total ganho das carteiras dela hoje é R$ 2.454,83 —
ou seja, ela sacou mais do que o recálculo passou a reconhecer (diferença na casa dos
R$ 33). O extrato já calcula esse valor ("overpaid"), mas o disponível é travado em
zero e nada desconta a dívida automaticamente quando entra dinheiro novo.

## O que será feito

### A. Antecipação também para o co-produtor
1. A lista de "liberar antecipado" de venda de produto passa a incluir os créditos de
   co-produção em carência, com o nome do pedido, o valor que é da pessoa e a data em
   que sairia sozinho.
2. Quem é dono do pedido passa a ver o valor **dele** (líquido menos os repasses de
   co-produção), com uma linha indicando quanto vai para os co-produtores.
3. Liberar por qualquer um dos lados libera o pedido inteiro — a tela avisa isso antes
   de confirmar, para não parecer que o outro lado ficou de fora.
4. Após liberar, as carteiras de todos os envolvidos no pedido são recalculadas, não só
   a de quem foi clicado.

### B. Saldo devedor (carteira negativa) tratado como dívida
1. O extrato passa a mostrar explicitamente "Saldo devedor: R$ X" quando a pessoa sacou
   mais do que o realizado, em vez de simplesmente exibir zero.
2. Todo valor novo que entrar como disponível abate primeiro a dívida; só o excedente
   vira saldo sacável. O saque continua bloqueado enquanto houver dívida.
3. A dívida aparece no painel do titular e na lista de Pagamentos do admin, para não ser
   descoberta só na hora do saque.
4. Ana Flávia entra com a dívida do recálculo já registrada e será abatida pelas
   próximas comissões dela.

## Como conferir depois
- No painel do Hernan: `PP-DDEB53DE` aparece com R$ 742,89 disponível para antecipar;
  ao liberar, o valor entra no disponível dele e no da Major Hub.
- No painel da Ana Flávia: aparece o saldo devedor em vez de zero; ao entrar uma
  comissão nova, a dívida cai no mesmo valor e o disponível só sobe depois de quitada.

## Detalhes técnicos
- `listBlockedCreatorOrders` passa a ler `financial_ledger_events` (estados `hold` de
  `product_created`, `coproduction_received`, `coproduction_paid`) em vez de consultar
  `partner_product_orders` por `partner_id`/`professional_coach_id`.
- `advanceCreatorRelease` / `admin_advance_creator_release` aceita pedidos onde o perfil
  é co-produtor e recalcula as carteiras de todos os perfis ligados ao pedido.
- `wallet_statement` já devolve `overpaid`; novo campo `debt_open` e ordem de abatimento
  (dívida antes de disponível) no cálculo de `available`, com `recalc_wallets_for_owner`
  consumindo o mesmo número.
- UI: `PayablesPanel.tsx`, `admin.payments.tsx`, `WalletStatementCard.tsx` e a aba de
  carteira do parceiro/profissional.
- Verificação: `node node_modules/typescript/bin/tsc --noEmit` com zero erros.
