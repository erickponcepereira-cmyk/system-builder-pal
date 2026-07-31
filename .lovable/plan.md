# Corrigir comissões travadas em vendas de parceiro/profissional

## O que aconteceu (confirmado no banco)

A compra da Alcinata (pedido PP-297C588F, R$ 100,00, PIX) foi **aprovada pelo Mercado Pago às 19:00 de 31/07** — o pagamento está registrado como `approved`. Mesmo assim o pedido continua "pendente", a Vimark Comunicação não recebeu o valor e nenhuma comissão foi gerada.

Causa confirmada pelos logs do banco:

```text
ERROR: insert or update on table "coach_points_log"
violates foreign key constraint "coach_points_log_product_id_fkey"
```

O processamento do pedido pago grava pontos de carreira do coach vendedor e tenta gravar o `product_id` do **produto de parceiro** numa coluna que só aceita IDs da tabela de produtos da loja própria. O banco recusa, e como tudo roda numa única transação, **todo o processamento é desfeito**: pedido volta a "pendente", carteira do parceiro não recebe, comissões de rede não nascem.

O gatilho só aparece quando a taxa do sistema é ≥ R$ 2,00 (abaixo disso não há pontos e o pedido passa normalmente) — por isso alguns pedidos funcionaram e outros não.

Além disso, dois efeitos secundários:
- Depois da falha, o registro do pagamento já está como "aprovado", e a rotina de reprocessamento entende que "já foi processado" e não tenta de novo — o pedido fica travado para sempre.
- Ocorre também erro de chave duplicada em `coach_patent_achievements`, que pode derrubar a mesma transação em outros casos.

## Impacto

- **19 pedidos** de parceiro/profissional com taxa ≥ R$ 2,00 estão presos em "pendente" (o mais antigo de 12/06) — nenhum pedido nessa faixa jamais foi concluído.
- **0 pedidos** com taxa ≥ R$ 2,00 constam como pagos, o que confirma que a falha é sistemática, não pontual.

## Correção proposta

1. **Migração de banco**
   - Corrigir `grant_partner_product_perks` para não gravar o produto de parceiro/profissional na coluna com vínculo à loja própria (guardar a referência no campo de metadados, mantendo os pontos de carreira).
   - Tornar a concessão de pontos/carteirinha/tickets **tolerante a falhas**: se algo der errado nessa etapa, o pagamento continua sendo confirmado (registro de erro em log) em vez de derrubar a venda inteira.
   - Mesma proteção para a conquista de patente duplicada.
2. **Reprocessamento seguro**
   - Ajustar a rotina de conciliação para reprocessar pedidos cujo pagamento está aprovado mas cuja origem continua pendente, mesmo que o pagamento já esteja marcado como aprovado (hoje ela para antes).
3. **Reprocessar os casos existentes**
   - Rodar a conciliação para os 19 pedidos afetados: marcar como pagos, creditar carteiras de parceiro/profissional, gerar comissões do vendedor, rede (L1/L2/L3), master coach e taxas do sistema, com a data original do pagamento (para a carência de 7 dias contar do dia certo).
   - Conferir individualmente o caso Alcinata/Vimark ao final.
4. **Prevenção**
   - Alerta no painel admin (aba de pagamentos) listando pagamentos aprovados cuja origem ainda não foi processada, para que esse tipo de falha apareça na hora.

## Detalhes técnicos

- `public.grant_partner_product_perks`: remover uso de `product_id` (FK → `products`) para IDs de `partner_products`/`professional_products`; mover para `metadata`.
- `public.process_partner_product_order_paid`: envolver as etapas não-financeiras (perks, ranking, patente) em blocos `EXCEPTION WHEN OTHERS` com `RAISE WARNING`, mantendo atômico apenas o núcleo financeiro.
- `src/lib/mp-sweep.server.ts` e `src/lib/admin-reconcile.functions.ts`: critério de reprocesso passa a ser "pagamento approved + origem não paga", ignorando o curto-circuito por `alreadyApproved`; mesmo ajuste no `api.public.mp.webhook.ts` (idempotência baseada no status da origem, não do pagamento).
