## Problema confirmado

Hoje o banco conta como "vaga usada" qualquer pedido cujo status não seja `cancelled/refunded/failed`. Como há 21 pedidos `pending` contra 10 `paid` (vários pendentes de PIX abandonados desde 25/07), o estoque aparece consumido sem venda concretizada. Isso acontece em dois pontos:

- `create_partner_company_order` — bloqueio da venda (`Produto esgotado`)
- `partner_products_stock_status` — contador exibido na vitrine ("X de Y vagas restantes")

## Regra nova

Vaga é consumida quando:
1. o pedido está **pago** (`paid`, e demais status pós-pagamento como `preparing/shipped/delivered/completed`), **ou**
2. o pedido está **pendente há menos de 30 minutos** — reserva temporária que impede dois compradores fecharem a mesma última vaga ao mesmo tempo.

Pendentes com mais de 30 minutos deixam de bloquear e a vaga volta ao estoque automaticamente. O pedido antigo continua existindo; se ele for pago depois e não houver mais vaga, ele é aceito mesmo assim (pagamento nunca é rejeitado), apenas registrando o excedente.

## Alterações técnicas (migração de banco)

1. Função auxiliar `partner_product_used_slots(_product_id)` com a regra acima, usada pelos dois pontos, evitando divergência entre o que a loja mostra e o que a venda valida.
2. `create_partner_company_order`: mantém o `SELECT ... FOR UPDATE` no produto (proteção contra corrida na última vaga) e passa a usar a nova contagem.
3. `partner_products_stock_status`: mesma contagem, para o card mostrar vagas reais.
4. Nenhuma mudança de front-end é necessária — `PartnerProfessionalStore.tsx` já consome o RPC.

## Verificação

Após aplicar, conferir no "Aulão de Jump" e demais produtos com `stock` definido que as vagas restantes voltam a refletir apenas pagos + pendentes recentes, e simular duas compras simultâneas da última vaga para confirmar que a segunda ainda é recusada.
