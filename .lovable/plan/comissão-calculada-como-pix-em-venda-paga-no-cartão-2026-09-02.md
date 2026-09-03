# Comissão calculada como Pix em venda paga no cartão

## Diagnóstico confirmado

- A venda da Karla (pedido FM-D77E7F0E, R$ 1.280,00, 02/09) está com `store_orders.payment_method = 'pix'`, enquanto o pagamento aprovado no gateway (`mercadopago_payments`) é `credit_card`.
- O pedido nasce com a forma escolhida no carrinho. Quando a pessoa paga na tela de pagamento por outro meio, nada volta para o pedido: nem o webhook nem a aprovação sincronizam esse campo.
- O processamento financeiro (`mark_store_order_paid_and_process`) escolhe a taxa da maquininha por `store_orders.payment_method`. Nessa venda aplicou 0,99% (Pix, R$ 12,67) em vez da taxa de cartão, inflando o líquido (R$ 1.267,33) e todas as comissões geradas.
- Escopo real da divergência: **16 pedidos da loja** e **17 pedidos de parceiro**, o primeiro em 30/06/2026, distribuídos em jul (5), ago (8) e set (2) na loja. Ocorre nos dois sentidos (pedido "pix"/pago no cartão e pedido "cartão"/pago no Pix).
- As comissões da venda da Karla ainda estão **todas pendentes** (criadas em 02/09), então podem ser refeitas sem mexer em valor já sacado.

## 1. Corrigir a causa (migration)

- Criar `sync_source_payment_method_from_mp(kind, id)`: copia a forma de pagamento do pagamento **aprovado** para `store_orders` (enum) ou `partner_product_orders` (texto, `credit_card` → `card`).
- Gatilho em `mercadopago_payments` (insert/update de status ou método): ao ficar `approved`, sincroniza o pedido. Como o webhook grava o pagamento antes de disparar o processamento, a taxa passa a ser calculada já com o método real.
- Backfill dos 33 pedidos divergentes, alinhando o método ao pagamento aprovado.

## 2. Refazer a venda da Karla

Somente para o pedido FM-D77E7F0E, cujas comissões estão pendentes:

- apagar transação e comissões geradas;
- zerar `payment_fee`/`tax_amount` para recálculo;
- reprocessar com o método correto (cartão), gerando taxa e comissões corretas;
- recalcular as carteiras dos beneficiários envolvidos.

## 3. Vendas antigas divergentes

Os demais pedidos (jun–ago) já têm comissões liberadas, sacadas ou pagas. Neles a correção será apenas o registro da forma de pagamento, sem reprocessar valores — refazer retroativamente mexeria em saldo já pago. Ao final entrego a lista desses pedidos com a diferença estimada de taxa, para você decidir caso a caso se quer ajuste manual.

## 4. Validação

- Conferir que FM-D77E7F0E passa a mostrar cartão, com taxa de maquininha de cartão e comissões recalculadas.
- Rodar consulta de divergência novamente: deve retornar zero.
- Simular aprovação (insert/update em pagamento) para confirmar que o gatilho sincroniza.
- Rodar a verificação TypeScript obrigatória sem regressão.

## Detalhes técnicos

- Nenhuma mudança de front-end é necessária: o defeito está no pipeline pedido → pagamento → processamento.
- A correção fica no banco (função + gatilho + backfill) em migration versionada, e o reprocesso da venda da Karla é uma operação de dados separada.
- Documentar em `docs/contexto/fitmind-financeiro.md` a regra: a forma de pagamento canônica é a do pagamento aprovado no gateway, nunca a escolhida no carrinho.
