# FitMind — fonte financeira única

## Regra permanente

`financial_ledger_events(profile_id)` é a fonte canônica de comissões, ganhos de produtos próprios e créditos de co-produção. `wallet_statement` consolida esse ledger com saques, pagamentos por carteira e adiantamentos. O painel administrativo de Contas a Pagar deve consumir `admin_payables_report`; não deve reconstruir os totais lendo tabelas de carteiras separadamente.

## Identidade financeira

- Resolver sempre todos os registros de parceiro e profissional ligados ao `profile_id`.
- Nunca usar `LIMIT 1`, `maybeSingle()` ou apenas o primeiro cadastro para calcular saldo.
- Deduplicar eventos por origem financeira; não somar novamente o mesmo pedido porque ele aparece nos papéis de criador, vendedor e co-produtor.
- Carteiras materializadas são cache para compatibilidade. Em caso de divergência, prevalece `wallet_statement`.

## Estados

- `available`: liberado após carência e regras financeiras.
- `hold`: ainda em carência.
- `network_blocked`: comissão de rede sem missão concluída; não entra no disponível.
- Fitcoin permanece separado do dinheiro sacável.
- Saques abertos, pagamentos internos e adiantamentos reduzem o disponível consolidado apenas uma vez.

## Forma de pagamento

- A forma de pagamento canônica é a do pagamento **aprovado** no gateway (`mercadopago_payments.payment_method`), nunca a escolhida antes do checkout.
- `store_orders.payment_method` / `partner_product_orders.payment_method` são sincronizados por gatilho (`sync_source_payment_method_from_mp`) assim que o pagamento fica `approved`, antes do processamento financeiro.
- A taxa da maquininha (Pix ~0,99% x cartão ~4,98%) sai desse campo; se ele mentir, todo o líquido e todas as comissões saem inflados. O carrinho não pergunta mais a forma de pagamento por causa disso.
- Bug histórico: 02/09/2026, pedido FM-D77E7F0E (R$ 1.280,00) pago no cartão e processado como Pix. Reprocessado; 15 pedidos anteriores tiveram apenas o registro do método corrigido.

## Segurança e operação

- As funções canônicas são internas e executáveis apenas por `service_role`; telas chamam funções de servidor autenticadas.
- Mudanças em comissões, pedidos e co-produções precisam terminar em recálculo idempotente do perfil afetado.
- Após qualquer alteração estrutural, comparar painel, extrato consolidado e carteiras materializadas, além de conferir múltiplos IDs para o mesmo perfil.

## Data da venda nos relatórios

- A data canônica de uma venda da loja é `store_orders.paid_at` (com `created_at` como último recurso). **Nunca use `updated_at`**: qualquer correção administrativa no pedido reescreve esse campo e joga a venda para o dia da correção.
- Bug histórico: 02/09/2026, o backfill de forma de pagamento tocou 16 pedidos e a adesão da Katyerly (FM-8298F056, paga em 31/08) passou a aparecer como venda de 02/09 no relatório da coach Suellyn. Carteira, comissões e pontos estavam corretos — só a data do relatório mentia.
- `paid_at` foi backfilled em todos os 177 pedidos pagos e agora é preenchido automaticamente pelo gatilho `trg_set_store_order_paid_at`.
