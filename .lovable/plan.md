## Objetivo
Quando a mensalidade de um parceiro ou profissional for paga, todos os alunos vinculados como colaboradores dessa conta devem receber automaticamente, referente àquele mês:
- 1 ticket do desafio (`student_challenge_tokens`)
- Renovação de 30 dias do desafio no `card_valid_until` do aluno

Vale para todo mês em que a mensalidade for quitada, e vale para parceiro e profissional.

## Diagnóstico atual
- Colaborador profissional: linha em `students` com `professional_coach_id = coach.id` do profissional.
- Colaborador parceiro: linha em `students` com `partner_id = partner.id`.
- Ticket do desafio hoje só é criado pelo trigger `grant_challenge_token_on_paid`, que roda em compras (`transactions.paid`) — não roda para pagamento de mensalidade.
- Pagamento de mensalidade passa pela RPC `process_subscription_invoice_payment`, que só marca a fatura como `paid` sem tocar em colaboradores.
- Resultado: as 2 colaboradoras da Delma nunca receberam ticket nem os 30 dias, mesmo com a mensalidade dela paga.

## O que vamos construir

### 1. Migração (banco)
- Nova coluna `student_challenge_tokens.source_subscription_invoice_id uuid` (nullable) + índice único parcial `(student_id, source_subscription_invoice_id) WHERE source_subscription_invoice_id IS NOT NULL` — garante idempotência por fatura + aluno.
- Nova função `public.grant_collab_monthly_benefits(_invoice_id uuid)`:
  - Lê a fatura e o `user_id` dono dela.
  - Descobre `partner_id` e/ou `professional_coach_id` associados a esse `user_id` (via `partners.profile_id` e `coaches.profile_id` com `is_professional=true`).
  - Seleciona todos os `students` com `partner_id` ou `professional_coach_id` correspondentes.
  - Para cada aluno colaborador:
    - `UPDATE students SET card_valid_until = GREATEST(COALESCE(card_valid_until, now()), now()) + INTERVAL '30 days'` (só se ainda não houver token daquele invoice para aquele aluno — mantém idempotência).
    - `INSERT INTO student_challenge_tokens (student_id, source_subscription_invoice_id, granted_by, notes)` com `granted_by = 'purchase'` e nota "Colaborador — mensalidade <mês>".
- Novo trigger `trg_grant_collab_on_invoice_paid` em `subscription_invoices` AFTER INSERT OR UPDATE: quando `NEW.status = 'paid'` e (INSERT ou `OLD.status <> 'paid'`), chama `grant_collab_monthly_benefits(NEW.id)`.
- Ajuste em `revert_subscription_invoice_payment` (se existir): apagar tokens não consumidos daquela fatura e recuar `card_valid_until` em 30 dias (só se o token daquele invoice existia). Se ficar arriscado, deixamos apenas os tokens sendo removidos e mantemos o card — comento no plano final antes de aplicar.
- Backfill: para cada fatura já `paid` do último mês de referência da Delma (e demais parceiros/profissionais), rodar `grant_collab_monthly_benefits` uma vez — o índice único evita duplicar caso já exista.

### 2. Sem mudança de UI necessária
O aluno colaborador já enxerga o ticket na aba Desafio (via `student_challenge_tokens`) e o acesso pelos `card_valid_until`. Não precisa alterar frontend.

### 3. Verificação
- Rodar SELECT confirmando que as 2 colaboradoras da Delma receberam ticket + `card_valid_until` estendido.
- Simular novo pagamento (ou revert + repay) para conferir que só gera 1 token por fatura por aluno.

## Regras / observações
- O aluno colaborador que também é coach/parceiro/profissional continua excluído do desafio pelas regras existentes de "aluno puro"; o ticket é gerado mas o consumo respeita as regras atuais (mesma política do trigger de compra). Se quiser que eu bloqueie a geração para não-puros também aqui, sinaliza — não fiz por padrão para manter paridade com `grant_challenge_token_on_paid`.
- Faturas isentas (`exempted`) NÃO liberam benefícios — só `paid`. Se quiser incluir isentas, avisar.
