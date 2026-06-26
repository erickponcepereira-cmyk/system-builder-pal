BEGIN;
SET LOCAL session_replication_role = 'replica';

-- 1) Subir downline do Erick para o upline (mantém histórico)
UPDATE public.students SET coach_id = 'f9a44c8a-31ea-4ca1-8cef-b9049733c5e1'
WHERE coach_id = 'd2412b0a-d0c6-4788-8653-5067e5e20cd4';

UPDATE public.coaches SET upline_coach_id = 'f9a44c8a-31ea-4ca1-8cef-b9049733c5e1'
WHERE upline_coach_id = 'd2412b0a-d0c6-4788-8653-5067e5e20cd4';

-- 2) Auditoria
INSERT INTO public.admin_audit_log (action, target_profile_id, notes) VALUES
  ('user_deleted','84bf2c6c-d822-4ee6-b3b1-ef89ad47a858','Excluído erickpppjur@hotmail.com. 2 alunos transferidos para upline 331e4a6d-025e-4f6a-aa11-8d78a8be214f (erick ponce pereira).'),
  ('user_deleted','d79a5a9d-e2d0-4705-a4bd-fbce6fb364ca','Excluído nathan.utuari@hotmail.com.');

-- 3) Notificação ao coach destino
INSERT INTO public.notifications (profile_id, title, message, type)
VALUES ('331e4a6d-025e-4f6a-aa11-8d78a8be214f',
        'Rede transferida para você',
        'O coach erickpppjur@hotmail.com foi excluído e 2 alunos da rede dele foram transferidos para você.',
        'network_transfer');

-- 4) Exclusão dos usuários (cascata removerá profiles -> coaches/students/wallets/etc.).
--    session_replication_role=replica suspende validação de FKs e triggers nesta transação,
--    permitindo limpar a cadeia histórica de uma vez.
DELETE FROM auth.users WHERE id IN ('1ebc53b5-689d-4bfc-87c6-bd6174363c0e','66d5078e-616a-41e5-bf01-ce1806a99362');

-- 5) Limpeza explícita de tabelas que poderiam ficar com FK órfã (replica não revalida)
DELETE FROM public.commissions WHERE beneficiary_profile_id IN ('d79a5a9d-e2d0-4705-a4bd-fbce6fb364ca','84bf2c6c-d822-4ee6-b3b1-ef89ad47a858')
   OR beneficiary_coach_id = 'd2412b0a-d0c6-4788-8653-5067e5e20cd4';
DELETE FROM public.notifications WHERE profile_id IN ('d79a5a9d-e2d0-4705-a4bd-fbce6fb364ca','84bf2c6c-d822-4ee6-b3b1-ef89ad47a858');
DELETE FROM public.monthly_rankings WHERE coach_id='d2412b0a-d0c6-4788-8653-5067e5e20cd4';
DELETE FROM public.career_plan_progress WHERE coach_id='d2412b0a-d0c6-4788-8653-5067e5e20cd4';
DELETE FROM public.transactions WHERE student_id IN ('e8a8d751-3f1e-4a13-807d-fb4343e7c73e','74d9f19e-c4a6-4fa1-ae7f-17f235f313a5');
UPDATE public.partner_product_order_status_log SET changed_by = NULL WHERE changed_by IN ('d79a5a9d-e2d0-4705-a4bd-fbce6fb364ca','84bf2c6c-d822-4ee6-b3b1-ef89ad47a858');

COMMIT;