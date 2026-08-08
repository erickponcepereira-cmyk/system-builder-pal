# Corrigir liberação de ticket e carteirinha na compra do produto do condomínio

## O que está acontecendo

O pedido pago da Ana (PP-44E1B4B7, R$ 20,00, produto "Condomínio Chapada do Poente") não liberou nada: a aluna está com carteirinha vazia e sem ticket de desafio.

O produto está configurado certo (30 dias de carteirinha e 1 ticket como override manual). A falha está na rotina que concede os benefícios: ela grava o ticket com uma origem inválida para a tabela de tickets em dois pontos:

- marca a origem do ticket como "compra de produto de parceiro", mas a tabela só aceita os valores "purchase", "admin" ou "manual";
- grava o ID do produto do profissional num campo que só aceita IDs do catálogo principal de produtos.

Qualquer um dos dois derruba a rotina inteira, e como o erro é silenciado por um bloco de captura, a compra é registrada como paga, mas carteirinha e ticket são desfeitos junto com o erro — sem nenhum aviso.

## Correção

1. Ajustar a rotina de concessão de benefícios:
   - usar origem válida ("purchase") no ticket e manter a rastreabilidade do pedido no campo de observações (já usado hoje);
   - preencher o produto de origem somente quando ele existir no catálogo principal; caso contrário, deixar vazio e registrar a origem nas observações.
2. Deixar de silenciar a falha: quando a concessão falhar, gravar o motivo no próprio pedido (campo de metadados) para aparecer no admin, em vez de sumir silenciosamente.
3. Reprocessar os pedidos pagos que ficaram sem benefícios (inclui o da Ana), concedendo carteirinha e ticket retroativamente sem duplicar quem já recebeu.

## Detalhes técnicos

- Migração alterando `public.grant_partner_product_perks`:
  - `granted_by` passa de `'partner_product_purchase'` para `'purchase'` (CHECK `student_challenge_tokens_granted_by_check`);
  - `source_product_id` só recebe valor se existir em `public.products` (FK `student_challenge_tokens_source_product_id_fkey`), senão `NULL`;
  - `notes` continua `'partner_order:<id>'`, que é a chave de idempotência.
- `_wrap_grant_partner_product_perks_trigger`: manter o `EXCEPTION`, mas gravar `metadata.perks_error` + `perks_error_at` no pedido (via update fora da subtransação abortada) além do `RAISE WARNING`.
- Bloco `DO` de backfill: para cada `partner_product_orders` com `status='paid'` e `metadata->>'perks_granted'` nulo, chamar `grant_partner_product_perks(id)`. A guarda de `notes` e a guarda de `perks_card_days` evitam duplicidade.
- Verificação após aplicar: conferir `students.card_valid_until` e `student_challenge_tokens` da Ana (student `7f35dab3…`) e o `metadata.perks_granted` do pedido.
