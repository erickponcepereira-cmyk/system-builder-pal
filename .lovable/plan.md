# Adiantamentos: quitação automática

## O que eu verifiquei agora

- A função `wallet_statement` já desconta o adiantamento em aberto: `available = (carteira coach + parceiro + profissional) - adiantamento em aberto`, e devolve também `available_before_advance` e `advance_open`.
- O extrato (`WalletStatementCard`) já mostra a linha de "Adiantamento" quando há valor em aberto, e o painel admin de Carteiras mostra a coluna por pessoa.
- Caso da Ana Flávia: adiantamento de R$ 45,98, `settled_amount` = R$ 0,00. Ou seja, **o valor já está fora do disponível — você não precisa deduzir manualmente no próximo pagamento.**
- O que **não** existe hoje: quitação automática. O campo `settled_amount` só muda quando um admin clica em "quitar" manualmente. Então o adiantamento fica descontando o disponível para sempre, mesmo depois de já ter sido "pago" pelas comissões novas.

## O que proponho construir

1. **Baixa automática do adiantamento quando um saque é pago.** Ao marcar um saque como pago, o sistema abate o adiantamento em aberto do usuário na ordem mais antiga primeiro, atualizando `settled_amount` (parcial ou total).
2. **Baixa automática por liberação de comissão** (opcional, escolha do usuário): conforme comissões novas ficam disponíveis, o adiantamento vai sendo quitado sozinho, sem esperar um saque.
3. **Histórico de quitação.** Registrar data e origem de cada baixa (saque X, comissão Y) para auditoria.
4. **Extrato mais claro.** Mostrar "Adiantamento: R$ X (quitado R$ Y de R$ Z)" em vez de só o saldo aberto.

## Detalhes técnicos

- Nova função `settle_advances_for_profile(_profile_id, _amount, _origem)` em SQL (SECURITY DEFINER), aplicando baixa FIFO em `wallet_advances`.
- Chamada a partir do fluxo que marca saque como pago (`admin_mark_withdrawal_paid` / `admin_mark_student_withdrawal_paid`).
- Coluna/tabela de log `wallet_advance_settlements` (advance_id, amount, origin, created_at) com GRANTs para `authenticated` (leitura própria) e `service_role`.
- `wallet_statement` passa a devolver `advance_settled` além de `advance_open`; `WalletStatementCard` exibe o par.

Sem mudança no cálculo de disponível — ele já está correto.
