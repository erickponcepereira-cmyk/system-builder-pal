# Separar Fitcoin, registrar adiantamentos e ver cada carteira no admin

## 1. Adiantamento (pagamento acima do liberado)

Hoje a Ana Flávia tem R$ 278,47 pagos em saques contra R$ 232,49 efetivamente liberados em comissões — diferença de R$ 45,98 paga adiantada. Não existe hoje nenhum lugar que registre isso, então o valor "some" e a conta nunca fecha.

- Nova tabela de adiantamentos de carteira: pessoa, valor, motivo, quem lançou, data, e quanto já foi quitado.
- O extrato consolidado passa a descontar o saldo em aberto de adiantamento do "disponível para saque", e a mostrar a linha "Adiantamento a compensar".
- Conforme novas comissões forem liberadas, o adiantamento vai sendo quitado automaticamente (o disponível só volta a crescer depois de cobrir a diferença).
- Lançamento inicial: R$ 45,98 para a Ana Flávia, com o motivo "saque pago acima do valor liberado".
- No admin, botão para lançar/ajustar adiantamento manualmente em qualquer pessoa.

## 2. Fitcoin / indicação fora da carteira

A carteira de indicação (Fitcoin do aluno) hoje entra somada no disponível — por isso a Ana aparece com R$ 40,00 "disponíveis" que na verdade são de indicação.

- O extrato passa a excluir a carteira de indicação do "disponível para saque" e do "total ganho" da carteira profissional.
- A indicação vira um bloco próprio no extrato: disponível, pendente e total ganho em Fitcoin, exibido separado tanto no painel da pessoa quanto no admin.
- O teto de saque do painel do coach/parceiro/profissional deixa de incluir Fitcoin. O saque de Fitcoin continua pelo fluxo próprio de aluno, sem mistura.

## 3. Admin: valores por carteira

Nova visão em Admin → Pagamentos, aba "Carteiras", com:

- **Totais do sistema por tipo de carteira**: Comissões (coach), Produtos criados (parceiro), Produtos criados (profissional), Indicação/Fitcoin (aluno), Nutricionista, Professor, Admin/sistema — cada uma com disponível, em carência, bloqueado por missão, total ganho e total sacado.
- **Linha de conferência**: soma geral do que está disponível hoje, do que ainda vai liberar e do adiantamento em aberto.
- **Por pessoa**: tabela com uma coluna por tipo de carteira, para ver de onde vem cada valor, com busca por nome/e-mail e exportação em CSV.
- Clicando na pessoa abre o extrato consolidado já existente, agora com Fitcoin e adiantamento separados.

## Verificação

- Extrato da Ana Flávia deve fechar: disponível para saque R$ 0,00 (R$ 40,00 são Fitcoin e há R$ 45,98 de adiantamento a compensar), carência R$ 200,48, rede bloqueada R$ 142,64.
- Somatório do admin por carteira deve bater com a soma das pessoas listadas.
- Solicitar saque com o teto novo não pode mais dar "saldo insuficiente".

## Detalhes técnicos

- Migração: tabela `wallet_advances` (profile_id, amount, settled_amount, reason, created_by) com GRANT para `service_role` e leitura via admin; atualização da função `public.wallet_statement` para (a) mover `student_wallets` para um bloco `fitcoin` fora de `available`/`total_earned`, (b) subtrair adiantamento em aberto do `available`, (c) devolver `advance_open`; seed do lançamento da Ana Flávia.
- Server functions: `getWalletsOverview` (totais por tipo + por pessoa) e `upsertWalletAdvance` em `src/lib/wallet-statement.functions.ts`, ambas restritas a admin.
- UI: atualizar `WalletStatementCard.tsx` (blocos Fitcoin e Adiantamento), `WalletTab.tsx` (teto de saque sem Fitcoin) e `admin.payments.tsx` (aba "Carteiras" + botão de adiantamento).
