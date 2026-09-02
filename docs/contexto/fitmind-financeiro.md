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

## Segurança e operação

- As funções canônicas são internas e executáveis apenas por `service_role`; telas chamam funções de servidor autenticadas.
- Mudanças em comissões, pedidos e co-produções precisam terminar em recálculo idempotente do perfil afetado.
- Após qualquer alteração estrutural, comparar painel, extrato consolidado e carteiras materializadas, além de conferir múltiplos IDs para o mesmo perfil.