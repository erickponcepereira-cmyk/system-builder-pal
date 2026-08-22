# Carteira: acabar com "343 a liberar" x "600 pendente"

## Como está hoje (verificado no banco)

O extrato mostra dois números que vêm de **fontes diferentes** e por isso nunca batem:

- **"A liberar"** é calculado direto das comissões: só o que ainda **não venceu o prazo de carência**. A rede que já venceu o prazo mas ainda não bateu a missão sai desse número e aparece separada em "Rede bloqueada".
- **"Pendente"** é o campo `pending_balance` gravado nas carteiras. Ele **mistura** carência + rede bloqueada (e, em quem tem loja, o pendente de parceiro/profissional).

Exemplo real de um perfil atual: carteira com **R$ 343,12 pendente**, que na verdade é **R$ 200,48 em carência + R$ 142,69 de rede já vencida mas bloqueada pela missão**. Mesmo dinheiro, contado com dois critérios e exibido como se fossem dois valores independentes.

Além disso, hoje o resumo mostra só um total agregado: não dá para ver quanto do "a liberar" e do "pendente" vem de **parceiro**, de **profissional** e de **coach**.

## Como vai ficar

1. **Um único conceito de pendência.** "Pendente" deixa de ser um número solto: passa a ser exatamente a soma de
   `A liberar (carência) + Rede bloqueada`, calculada sempre pela mesma fonte (comissões + carteiras de parceiro/profissional). O `pending_balance` das carteiras deixa de ser exibido como número independente.

2. **Rede fora do "a liberar".** "A liberar" mostra apenas carência de **coach + parceiro + profissional**. A rede do mês só entra nesse número **depois** de bater a missão; até lá fica na linha "Rede bloqueada", com o texto explicando que não é sacável.

3. **Resumo com origem do dinheiro.** No extrato passa a aparecer, lado a lado:

```text
Disponível para saque agora      R$ ....   (coach + parceiro + profissional)
  ├ Coach (comissões)            R$ ....
  ├ Parceiro (produtos/serviços) R$ ....
  └ Profissional                 R$ ....

A liberar (carência)             R$ ....
  ├ Coach                        R$ ....
  ├ Parceiro                     R$ ....
  └ Profissional                 R$ ....

Rede bloqueada (missão do mês)   R$ ....   não entra em nada acima
Pendente total = A liberar + Rede bloqueada
```

4. **Saque continua só pelo perfil de coach**, que já é onde as três carteiras são somadas. Deixamos isso explícito na tela ("o saque reúne coach, parceiro e profissional") e o valor máximo permitido no saque é exatamente o "Disponível para saque agora" exibido.

5. **Fitcoin permanece separado**, sem entrar em disponível, a liberar ou pendente.

## Detalhes técnicos

- Atualizar `public.wallet_statement` para devolver `hold` e `available` quebrados por origem (`coach`, `partner`, `professional`) e passar a derivar `pending_total = hold + network_blocked`, em vez de somar `pending_balance` das carteiras.
- Ajustar `recalc_wallet_for_owner` para que `pending_balance` das carteiras use o mesmo critério (carência + rede bloqueada), evitando divergência entre a carteira gravada e o extrato.
- `src/lib/wallet-statement.functions.ts`: novo tipo com o detalhamento por origem.
- `src/components/shared/WalletStatementCard.tsx`: novas linhas com sub-itens por origem e rótulos revisados.
- `src/components/coach/tabs/WalletTab.tsx`: o "+ X a liberar" ao lado do saldo passa a mostrar só a carência (sem rede), com a rede em linha própria; o teto do saque continua vindo do mesmo `available`.
- Conferir o mesmo extrato no admin (`admin.payments.tsx`) para que a visão do administrador mostre os mesmos números.

## Validação

- Reproduzir o perfil com R$ 343,12: deve exibir A liberar R$ 200,48 + Rede bloqueada R$ 142,69 = Pendente R$ 343,17 (arredondamento conferido).
- Conferir um perfil só coach, um só parceiro e um com as três carteiras.
- Solicitar saque no valor exato do disponível e confirmar que passa sem erro.
