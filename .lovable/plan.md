## Diagnóstico

- Perfil da Narah Reis (`3d2c7b3b-…765253`) está `active`, com `user_subscriptions` `active`, `billing_day=5`, forma preferida `wallet`.
- Fatura de **junho/2026** (`c0d35e10-…`) foi definida como `cancelled` em 06/07/2026, **sem registro em `subscription_payment_log` nem em `subscription_invoice_audit`** — não veio de `admin_skip_invoice` nem `postpone_subscription_invoice`. Provável cancelamento manual antigo direto no banco.
- Fatura de **julho/2026** (`12edaa21-…`, R$ 100, venceu 05/07) foi promovida para status **`blocked`** em 09/07 pela função automática `mark_overdue_invoices` (grace_days = 3). `is_user_blocked_by_subscription` retorna `true` para ela — por isso o painel exibe a mensalidade como bloqueada/"cancelada".

## Correção

Vou usar a insert tool para executar um único bloco transacional que:

1. Atualiza a fatura de julho da Narah:
   - `status = 'pending'`
   - `due_date = CURRENT_DATE + 7`  (novo vencimento)
   - `notes = 'Reaberta manualmente pelo admin'`
   - `updated_at = now()`
2. Registra a mudança em `subscription_invoice_audit` (`action='reopen'`, `from_status='blocked'`, `to_status='pending'`, meta com motivo e novo vencimento).
3. Registra em `subscription_payment_log` (`action='postponed'`, details com previous/new due date), para aparecer no histórico do admin.

Filtro rígido por `id = '12edaa21-f3f6-4cb2-9849-cc7afa9bea20'` para não tocar outras faturas. Não mexo na fatura de junho (o usuário escolheu apenas reabrir julho).

## Verificação

Após aplicar, rodar `SELECT status, due_date, updated_at FROM subscription_invoices WHERE id='12edaa21…'` e `SELECT is_user_blocked_by_subscription('5f6355a5-…602')` para confirmar `pending` + `false`.

## Fora do escopo

- Não vou investigar/desbloquear a raiz do cancelamento de junho (sem log; usuário optou por não reemitir).
- Não vou alterar o job `mark_overdue_invoices` — o comportamento automático de bloquear inadimplentes deve continuar valendo para os demais alunos.
