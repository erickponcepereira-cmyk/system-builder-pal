## Diagnóstico (verificado no banco)

Consultei os pagamentos recentes em `mercadopago_payments`:

- **Nenhum pagamento de cartão ficou realmente "em análise"**. Os dois testes de hoje (05:30 e 05:35, R$ 1,00) estão gravados como `rejected / cc_rejected_high_risk`. A mensagem "Pagamento em análise. Você será notificado." que apareceu na tela veio do fluxo PIX pendente do mesmo pedido (linha PIX `pending_waiting_transfer` criada às 05:29), não do cartão — ou seja, o usuário vê um aviso que não corresponde ao resultado real do cartão.
- Nesses dois testes o campo `payer_name` está **nulo** (antes das últimas mudanças vinha preenchido). O Brick `cardPayment` não devolve o nome do titular no `onSubmit` (só `payer.email` e `payer.identification`), então, ao parar de usar o nome do cadastro, o pagamento passou a ser enviado ao Mercado Pago **sem nome do titular** — o que piora ainda mais o score antifraude e mantém o `cc_rejected_high_risk`.

## O que fazer

1. **Recuperar o nome real do titular do cartão (servidor)**
   - No fluxo de cartão, consultar o token no Mercado Pago (`GET /v1/card_tokens/{token}`), que devolve `cardholder.name` e `cardholder.identification`.
   - Usar esses dados como `payer` do pagamento (nome + CPF do titular), com fallback para o que veio do formulário e, por último, para o e-mail da conta.
   - Assim o pagamento volta a ir completo (nome + documento coerentes com o cartão), sem reintroduzir os dados do cadastro de quem está logado.

2. **Coerência do e-mail do pagador**
   - Manter o e-mail da conta (obrigatório para o MP), mas garantir que nome/documento venham sempre do titular do cartão.

3. **Mensagens corretas no checkout**
   - Separar o estado do PIX do estado do cartão: só mostrar "Pagamento em análise" quando o próprio cartão retornar `in_process`/`pending`.
   - Ao gerar um cartão novo em um pedido que já tem PIX pendente, limpar o aviso do PIX para não confundir o resultado.
   - Exibir sempre o motivo real da recusa (já traduzido) logo abaixo do formulário.

4. **Diagnóstico rápido de risco**
   - Registrar no `raw_response`/log qual origem do nome do titular foi usada (token, formulário ou vazio), para conseguir confirmar em produção que o payload está completo.

## Observação importante

`cc_rejected_high_risk` é decisão do antifraude do Mercado Pago. Enviar nome/CPF do titular, device fingerprint e itens (tudo isso já existe ou volta com esta correção) maximiza a chance de aprovação, mas se os cartões testados continuarem recusados pode ser necessário abrir chamado no Mercado Pago para revisão do perfil da conta vendedora — vou indicar isso caso o próximo teste ainda recuse com payload completo.

## Arquivos afetados

- `src/server/mercadopago.server.ts` — nova função para ler o card token.
- `src/lib/mercadopago-impl.server.ts` — montar o payer a partir do titular do cartão.
- `src/components/payments/MercadoPagoCheckout.tsx` — mensagens/estado por método de pagamento.
