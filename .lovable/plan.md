## Diagnóstico confirmado

O pagamento da anuidade da Tammylis foi aprovado no gateway e registrado localmente como `approved`, mas o pedido `FM-04DDBC24` continuou `pending` e o cadastro não avançou.

Causa encontrada: o processamento do pedido chama a função financeira de venda (`process_paid_transaction`) e ela está quebrando em `column ctc.product_id does not exist`. Esse erro interrompe a etapa que marca o pedido como pago e, por consequência, não registra `activation_paid_at` no coach/parceiro. Por isso a tela continua pedindo mensalidade/liberação mesmo depois da anuidade paga.

Também encontrei uma fatura mensal criada para essa pessoa no mesmo dia, ainda pendente. A correção deve garantir que a anuidade seja processada como anuidade, sem exigir pagamento de mensalidade naquele momento.

## Plano de correção

1. **Corrigir a função financeira quebrada**
   - Atualizar `process_paid_transaction` para buscar professor/comissão usando as colunas reais da tabela atual, removendo a referência inválida a `ctc.product_id`.
   - Preservar todo o restante do motor financeiro: carteiras, comissões, pontos, ranking, ticket/carteirinha e relatórios.

2. **Blindar o fluxo de anuidade**
   - Ajustar o processamento de pagamento de pedido para que, quando o pedido contém o produto de anuidade, a ativação seja registrada mesmo se algum processamento financeiro secundário falhar.
   - Marcar corretamente:
     - `store_orders.status = paid`
     - transação vinculada como `paid`
     - `coaches.activation_paid_at/source/order_id`
     - `partners.activation_paid_at/source`, quando for parceiro
   - Para coach/parceiro/profissional em onboarding, avançar apenas a etapa correta de anuidade, sem criar obrigação imediata de mensalidade.

3. **Reprocessar os casos afetados**
   - Reprocessar pedidos de anuidade com pagamento aprovado mas pedido/cadastro ainda pendente, incluindo o caso atual da Tammylis.
   - Não duplicar comissão, pontos, carteira ou pagamento: a rotina será idempotente.

4. **Melhorar o fallback da tela de anuidade**
   - Manter o polling atual do Mercado Pago, mas fazer ele chamar a mesma rotina corrigida.
   - Se o webhook atrasar, a tela deve liberar após detectar `approved`, sem depender exclusivamente do webhook.

5. **Validar após aplicar**
   - Conferir no banco que o pagamento aprovado virou pedido pago.
   - Conferir que a anuidade aparece paga no cadastro.
   - Conferir que a mensalidade não foi exigida como próxima etapa da anuidade.
   - Conferir que não houve duplicidade de transação/comissão no reprocessamento.

## Arquivos e banco envolvidos

- Banco: funções `mark_store_order_paid_and_process` e `process_paid_transaction`.
- Backend: `src/lib/mercadopago-impl.server.ts` e `src/lib/coach-onboarding.server.ts`, se necessário para tornar o fluxo mais seguro.
- UI: `src/components/profile/AnnualActivationCard.tsx`, apenas se precisar melhorar o retorno visual após aprovação.

A correção será focada nesse fluxo; não vou mexer no sistema de loja, white label ou outras áreas.