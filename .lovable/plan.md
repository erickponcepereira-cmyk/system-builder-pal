# Ticket do desafio: correção da Carla + varredura geral

## O que eu encontrei (verificado no banco)

O motor automático **está funcionando**. Todas as compras pagas de produtos de ticket (Ticket Desafio Tradicional / 65 / 85) geraram o ticket correspondente — inclusive a da Carla.

O problema real é **conta duplicada**:

- Carla tem dois cadastros com o mesmo telefone (42998042176):
  - `carlacarmofisio@gmail.com` (criada 24/08 14:21) — foi aqui que caiu a compra de R$ 65, o ticket gerado e a inscrição manual que você fez no desafio (turma 4, agosto/2026).
  - `sgtcdocarmo@gmail.com` (criada 24/08 23:36) — conta vazia: sem ticket, sem inscrição.
- Se ela entra pelo segundo e-mail, não vê ticket nem desafio — exatamente o sintoma relatado.

Outros casos com o mesmo padrão (telefone repetido em duas contas, ticket em apenas uma):
- Jean Carlos / jean reis (65996880254)
- Fabiana Katrine (65999252905) — a segunda conta nem tem cadastro de aluno
- Contas de teste do Erick (66981283314)

Também encontrei duas falhas de processo:
1. **Não existe no admin nenhuma ação para conceder ticket manualmente** — só leitura de saldo. Os 5 tickets "admin" que existem foram inseridos direto no banco em datas antigas.
2. **A inscrição manual pelo admin não consome o ticket** do aluno, então ele fica com saldo e inscrição ao mesmo tempo (foi o que aconteceu com a Carla).

## O que será feito

### 1. Correção da Carla (imediata)
Unificar as duas contas dela usando a rotina de fusão de cadastros já existente, mantendo o e-mail que ela usa para entrar; o ticket, a compra de R$ 65 e a inscrição no desafio de agosto passam para a conta ativa. O coach dela é o mesmo nos dois cadastros, então nada de rede muda.

### 2. Varredura geral
Relatório único (executado uma vez, sem gastar tela) listando:
- todas as compras pagas de produto de ticket sem ticket gerado (hoje: nenhuma — fica como verificação de segurança);
- todas as contas duplicadas por telefone/CPF em que ticket, compra ou inscrição estão em cadastro diferente do que a pessoa usa.
Para cada caso confirmado, aplico a mesma unificação. Os cadastros de teste do Erick ficam de fora.

### 3. Fechar as brechas no admin
- Botão **"Conceder ticket"** no painel do admin (dentro do aluno / aba Desafio), registrando motivo e quem concedeu.
- A **inscrição manual** passa a consumir um ticket disponível do aluno (e, se não houver, o admin decide entre conceder um na hora ou inscrever como cortesia — fica registrado qual foi).
- Aviso visível no admin quando o aluno tiver **cadastro duplicado** (mesmo telefone/CPF), para evitar repetir o problema.

## Detalhes técnicos

- Fusão via `public.admin_merge_profiles` (já existe), destino = conta em uso; conferir depois `student_challenge_tokens`, `competition_enrollments`, `store_orders`, `transactions`.
- Auditoria: join `store_orders` + `store_order_items` + `products (type='challenge')` contra `student_challenge_tokens.source_transaction_id`; e duplicidade por `regexp_replace(phone,'\D','','g')` e por CPF.
- Novo server fn `grantChallengeToken` (admin-only) inserindo em `student_challenge_tokens` com `granted_by='admin'` + `notes`.
- `enrollManually` em `src/routes/_authenticated/admin.challenge.tsx` passa a chamar um server fn que, em transação lógica, cria a inscrição e marca `consumed_at/consumed_competition_id/consumed_enrollment_id` no ticket mais antigo livre.
- Nenhuma alteração no fluxo automático de compra (ele está correto).
