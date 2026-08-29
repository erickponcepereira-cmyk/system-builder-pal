# Liberar o curso da Adesão Anual (caso Alexander)

## O que está acontecendo (verificado no banco)

- Alexander Martins Ferreira está correto como aluno: tem perfil, cadastro de aluno com coach confirmado (sem pendência) e parceiro aprovado, com a Adesão Anual de R$ 179,90 **paga** em 29/08.
- O bloqueio que ele vê é apenas na tela do curso: "Seu acesso a este curso ainda não foi liberado".
- Motivo confirmado: existe um único curso na plataforma ("Formação de Coach FitMind") e a regra de acesso só libera para (a) quem tem uma compra registrada do curso ou (b) coach aprovado. Alexander é parceiro.
- A tabela de compras de curso está **vazia para todos os usuários**: nenhuma compra de curso foi registrada até hoje. A rotina que libera curso após o pagamento só olha itens do pedido marcados como curso digital — e a Adesão Anual é um item do tipo plano, sem ligação com o curso.
- Ou seja: quem paga a Adesão Anual (que na descrição inclui "o curso completo... e certificado") nunca recebeu o curso. Não é um caso isolado do Alexander; é a regra que nunca existiu.

## Correção

1. Criar no cadastro de produtos um campo "curso liberado na compra" e ligar a Adesão Anual ao curso Formação de Coach FitMind.
2. Ajustar a rotina de liberação pós-pagamento para liberar tanto o curso comprado diretamente quanto o curso vinculado a um produto que não é curso (caso da Adesão Anual).
3. Rodar a liberação retroativa em todos os pedidos já pagos que contêm esse produto — o acesso do Alexander e de qualquer outro parceiro/profissional na mesma situação passa a valer imediatamente, sem novo pagamento.

## Validação

- Conferir no banco que passou a existir compra de curso para o Alexander e para os demais pedidos pagos da Adesão Anual.
- Abrir a tela do curso com a conta dele e ver os módulos/aulas no lugar do aviso de bloqueio.
- Simular um novo pagamento de Adesão Anual e confirmar que o curso já nasce liberado.

## Detalhes técnicos

- Nova coluna `products.grants_digital_product_id` (FK para `digital_products`), preenchida para o produto `Adesão Anual`.
- `liberar_cursos_do_pedido` passa a unir `store_order_items.digital_product_id` com `products.grants_digital_product_id`, inserindo em `digital_purchases` com `expires_at` derivado de `access_days`.
- Backfill via laço sobre pedidos `paid` chamando a mesma função (idempotente: não duplica compras existentes).
- A regra de leitura (`can_view_digital_product`) não muda — passa a valer porque a compra passa a existir.
