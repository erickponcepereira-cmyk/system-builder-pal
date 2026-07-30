## Contexto

Não há venda paga do "Aulão de Jump" — os 3 pedidos são PIX pendentes. A vaga que aparecia como usada era a reserva temporária de 30 minutos do pedido mais recente.

## Ajuste

Reduzir a janela de reserva de pendentes de **30 para 10 minutos** na função `partner_product_used_slots`, mantendo tudo o mais igual:

- Vaga consumida = pedido pago (ou pós-pagamento: preparando/enviado/entregue) **ou** pendente criado há menos de 10 minutos.
- Pendente com mais de 10 minutos libera a vaga automaticamente.
- `create_partner_company_order` continua com `SELECT ... FOR UPDATE` no produto, impedindo duas vendas simultâneas da última vaga.
- `partner_products_stock_status` (usada pela vitrine) segue a mesma regra, então o card mostra o mesmo número que a venda valida.

## Verificação

Conferir que o "Aulão de Jump" volta a exibir 25 de 25 vagas assim que os pendentes passarem dos 10 minutos.
