# Carla do Carmo — consolidar no e-mail sgtcdocarmo e excluir o cadastro antigo

## O que já está confirmado no banco

Existem dois cadastros:

- `carlacarmofisio@gmail.com` — cadastro antigo, já marcado como "mesclado" em 26/08, aluno interno `21dba4c7…`
- `sgtcdocarmo@gmail.com` — cadastro atual, ativo, aluno interno `0fcfae8d…`

A mesclagem funcionou melhor do que parecia. Hoje, no cadastro **sgt**, já estão:

- a compra de R$ 65,00 (pedido FM-6076E36F, pago via Pix em 24/08, transação paga)
- o ticket do desafio gerado por essa compra, já consumido
- a inscrição no desafio (turma/edição de agosto), com pesagem inicial registrada (57,8 kg / 27,1% gordura)

O que ficou para trás: a **validade da carteirinha**. A data 23/09/2026 ficou gravada no cadastro antigo e o cadastro sgt está com a validade em branco — por isso a carteirinha dela aparece inativa.

## O que será feito

1. **Transferir a validade da carteirinha** para o cadastro sgt (23/09/2026, derivada da compra do ticket), para a carteirinha de aluno voltar a ficar ativa.
2. **Varrer todas as tabelas** que ainda apontem para o cadastro antigo (perfil e aluno antigos) e mover o que for histórico real para o cadastro sgt, para não perder nada na exclusão.
3. **Excluir o cadastro antigo** ligado a `carlacarmofisio@gmail.com`: remoção do perfil/aluno e também do login (para o e-mail não conseguir mais entrar nem gerar um terceiro cadastro).
4. **Conferência final**, com resultado reportado aqui: cadastro correto = sgt, compra presente e paga, desafio ativo com pesagem inicial, carteirinha ativa.

## Detalhes técnicos

- Migração única em SQL: atualiza `students.card_valid_until` do aluno `0fcfae8d…`; reapontamento dos registros remanescentes de `21dba4c7…`/`49711e70…`; `DELETE` do perfil antigo.
- Remoção do usuário de autenticação do e-mail antigo via API administrativa (não via SQL no schema `auth`).
- Nenhuma mudança em código de produto ou em regras gerais de mesclagem; é uma correção pontual de dados.
- Conferência final via consultas de leitura (pedido, transação, inscrição no desafio, ticket, validade da carteirinha).
