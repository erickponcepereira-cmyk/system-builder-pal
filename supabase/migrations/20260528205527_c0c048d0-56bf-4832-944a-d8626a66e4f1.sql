-- Permitir aluno atualizar o próprio enrollment (status) e inserir notificações
CREATE POLICY "enrollments_student_update_status" ON public.competition_enrollments
FOR UPDATE USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

-- Garantir que notifications aceita insert do aluno (tabela já existe; recriar política se necessário)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND policyname='notif_insert_any_authenticated') THEN
    EXECUTE 'CREATE POLICY "notif_insert_any_authenticated" ON public.notifications FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;