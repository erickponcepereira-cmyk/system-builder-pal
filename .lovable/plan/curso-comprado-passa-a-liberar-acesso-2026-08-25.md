# Curso comprado passa a liberar acesso

Verificado no banco agora:

- `create_store_order` ainda **não** conhece `digital_products` — comprar curso pelo carrinho realmente falha.
- `store_order_items.digital_product_id` existe e `product_id` aceita nulo.
- `mark_store_order_paid_and_process` contém a âncora esperada e ainda não tem o gancho.
- Não há nenhum pedido pago com item de curso — o passo retroativo não vai encontrar nada (é inofensivo).

## O que será aplicado

Uma migration única, exatamente como enviada:

1. `create_store_order` reescrita com o ramo digital: curso é resolvido em `digital_products` (apenas `status = 'active'`), grava `digital_product_id` no item e deixa `product_id` nulo. O `product_id` da transação usa um produto de referência (primeiro item que exista em `products`, senão um ativo qualquer), porque a coluna é obrigatória.
2. `liberar_cursos_do_pedido(uuid)` — nova, idempotente, insere em `digital_purchases` a partir dos itens do pedido pago, calculando validade por `access_days`. Execução só para `service_role`.
3. Gancho no corpo vivo de `mark_store_order_paid_and_process`, por remendo no texto da função (a versão completa não está no repositório), dentro de `BEGIN/EXCEPTION` para não derrubar a confirmação de pagamento. Privilégios repostos depois do `CREATE OR REPLACE`.
4. Varredura retroativa dos pedidos pagos com item de curso.

Nenhuma alteração de código de front-end: o carrinho já envia `kind: "digital"`.

## Conferência depois

- `create_store_order` passa a mencionar `digital_products`; a função de pagamento passa a mencionar `liberar_cursos_do_pedido`.
- Teste real: comprar um curso barato e conferir pedido pago → item com `digital_product_id` → linha em `digital_purchases` → curso visível em `/student/library`.
