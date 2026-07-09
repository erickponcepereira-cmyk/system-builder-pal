## Problema

Três funções RPC do checkout têm overloads antigos e quebrados que referenciam `s.upline_coach_id` — coluna inexistente em `public.students` (a correta é `s.coach_id`). Como cada função tem múltiplas assinaturas, o PostgREST pode resolver para a versão errada e o pedido falha com `column s.upline_coach_id does not exist`.

Funções afetadas (assinaturas antigas a remover):
- `create_partner_company_order(_partner_product_id, _student_id, _payment_method)` e `(_student_id, _partner_product_id, _payment_method, _referred_by_student_id)`
- `create_partner_product_order(_student_id, _partner_product_id, _payment_method, _referred_by_student_id)`
- `create_scheduled_professional_order(_professional_product_id, _starts_at, _payment_method, _student_id)`, `(..., _referred_by_student_id)` e `(_student_id, _professional_product_id, _scheduled_for, _payment_method, _referred_by_student_id)`

As assinaturas “boas” (que o app usa hoje) permanecem:
- `create_partner_company_order(_partner_product_id, _student_id, _payment_method)` — manter apenas se não tiver `s.upline_coach_id`; caso contrário, corrigir.
- `create_partner_product_order(_professional_product_id, _payment_method, _buyer_student_id[, _referred_by_student_id])`
- Precisamos deixar exatamente UMA versão de cada função ativa e funcional.

## Correção

Migração única que:

1. `DROP FUNCTION` em todas as assinaturas listadas de `create_partner_company_order`, `create_partner_product_order` e `create_scheduled_professional_order`.
2. `CREATE OR REPLACE FUNCTION` recriando apenas as versões corretas (usando `s.coach_id`, mantendo a lógica financeira atual já validada — inclusive Master Coach, cross-bonus, fitcoin e rede 3/2/1%).
   - `create_partner_company_order(_partner_product_id uuid, _student_id uuid DEFAULT NULL, _payment_method text DEFAULT 'pix')`
   - `create_partner_product_order(_professional_product_id uuid, _payment_method text DEFAULT 'pix', _buyer_student_id uuid DEFAULT NULL, _referred_by_student_id uuid DEFAULT NULL)` + wrapper de 3 args mantido.
   - `create_scheduled_professional_order(_professional_product_id uuid, _starts_at timestamptz, _payment_method text DEFAULT 'pix', _student_id uuid DEFAULT NULL, _referred_by_student_id uuid DEFAULT NULL)`
3. `GRANT EXECUTE ... TO authenticated` em todas.

## Verificação após aplicar

- Rodar `SELECT proname, pg_get_function_identity_arguments(...)` para confirmar que só as assinaturas novas existem.
- Buscar `s.upline_coach_id` no `pg_proc` de novo — deve voltar vazio.
- Testar compra de produto de parceiro no app (fluxo do print).

Nenhum código do frontend precisa mudar; as chamadas atuais já batem com as assinaturas mantidas.
