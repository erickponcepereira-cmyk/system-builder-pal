# Corrigir pagamento de mensalidade com carteira interna

## O problema (confirmado)

Ao pagar a fatura com a carteira interna, o erro `column "profile_id" of relation "fitcoin_ledger" does not exist` aparece e o pagamento falha.

Causa confirmada: a função de banco que faz o débito em cascata das carteiras (coach → parceiro → profissional) tenta gravar um registro na tabela de Fitcoin usando colunas que não existem nessa tabela (`profile_id`, `source`, `description`). A tabela de Fitcoin usa outras colunas (`student_id`, `amount`, `reason`, `balance_after`) e serve para cashback do aluno — não para débito de carteira. Como o insert quebra, toda a transação é revertida.

Isso afeta os três fluxos que usam esse débito: mensalidade, pedido da loja e pedido de parceiro.

## Correção

- Remover da função de débito em cascata o registro indevido na tabela de Fitcoin, mantendo o restante do débito intacto (mesma ordem: coach → parceiro → profissional, mesmo retorno com o detalhamento por carteira).
- Manter a validação de saldo insuficiente e o bloqueio de valores inválidos como está hoje.

## Verificação

- Simular o pagamento da fatura em aberto de um usuário com saldo (o caso da tela: saldo R$ 131,80, fatura R$ 100,00) e conferir que a fatura fica paga, o saldo cai e o histórico mostra "Carteira interna".
- Conferir que os pagamentos de pedido de loja e de parceiro com carteira seguem funcionando.

## Detalhes técnicos

Migração única alterando `public.debit_user_wallets_cascade`: retirar o `INSERT INTO public.fitcoin_ledger (...)`. Nenhuma mudança de front-end é necessária — `payInvoiceWithWallet` e `WalletPayButton` já tratam o retorno corretamente.
