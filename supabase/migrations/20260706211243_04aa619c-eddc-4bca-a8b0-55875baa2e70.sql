
-- Auditoria de vinculações de cadastros de avaliação → alunos do sistema
CREATE TABLE public.evaluation_link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.coach_evaluation_clients(id) ON DELETE SET NULL,
  previous_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  new_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('link','unlink','transfer','merge')),
  performed_by uuid,
  performed_by_role text,
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.evaluation_link_audit TO authenticated;
GRANT ALL ON public.evaluation_link_audit TO service_role;

ALTER TABLE public.evaluation_link_audit ENABLE ROW LEVEL SECURITY;

-- Admin vê tudo; coach vê apenas do seu escopo
CREATE POLICY "audit_select_admin_or_coach"
  ON public.evaluation_link_audit
  FOR SELECT
  TO authenticated
  USING (
    current_user_is_admin()
    OR coach_id = ANY (current_user_coach_ids())
  );

-- Qualquer usuário autenticado pode inserir (o cliente registra sua própria ação)
CREATE POLICY "audit_insert_authenticated"
  ON public.evaluation_link_audit
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_eval_link_audit_client ON public.evaluation_link_audit(client_id);
CREATE INDEX idx_eval_link_audit_coach ON public.evaluation_link_audit(coach_id);
CREATE INDEX idx_eval_link_audit_student_new ON public.evaluation_link_audit(new_student_id);
