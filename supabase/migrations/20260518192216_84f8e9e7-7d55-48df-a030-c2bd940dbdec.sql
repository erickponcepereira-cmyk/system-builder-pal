
-- 1. Catálogo de especialidades
CREATE TABLE public.professional_specialties (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_tabs JSONB NOT NULL DEFAULT '[]'::jsonb,
  requires_admin_setup BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_specialties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "specialties readable by authenticated"
ON public.professional_specialties FOR SELECT TO authenticated USING (true);

CREATE POLICY "specialties manageable by admin"
ON public.professional_specialties FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_specialties_updated_at
BEFORE UPDATE ON public.professional_specialties
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed inicial
INSERT INTO public.professional_specialties (key, label, description, icon, capabilities, default_tabs, sort_order) VALUES
('personal_trainer', 'Personal Trainer', 'Prescrição e acompanhamento de treinos', 'Dumbbell',
  '{"can_prescribe_workout":true,"can_evaluate_body":true}'::jsonb,
  '["students","workout","evaluate","wallet","network"]'::jsonb, 10),
('nutritionist', 'Nutricionista', 'Avaliação nutricional, dietas e protocolos alimentares', 'Apple',
  '{"can_prescribe_diet":true,"can_view_anamnese":true,"can_evaluate_body":true}'::jsonb,
  '["students","diet","anamnese","evaluate","wallet","network"]'::jsonb, 20),
('doctor', 'Médico(a)', 'Prescrições médicas e laudos clínicos', 'Stethoscope',
  '{"can_prescribe_medication":true,"can_request_exams":true,"can_view_anamnese":true}'::jsonb,
  '["students","prescriptions","exams","anamnese","wallet","network"]'::jsonb, 30),
('cardiologist', 'Cardiologista', 'Avaliação e acompanhamento cardiovascular', 'HeartPulse',
  '{"can_prescribe_medication":true,"can_request_exams":true,"can_view_anamnese":true,"can_issue_cardiology_report":true}'::jsonb,
  '["students","prescriptions","exams","cardio_reports","wallet","network"]'::jsonb, 35),
('esthetician', 'Esteticista', 'Protocolos estéticos e acompanhamento de sessões', 'Sparkles',
  '{"can_issue_aesthetic_protocol":true,"can_schedule_sessions":true}'::jsonb,
  '["students","aesthetic_protocol","sessions","wallet","network"]'::jsonb, 40),
('lawyer', 'Advogado(a)', 'Suporte jurídico para alunos e parceiros', 'Scale',
  '{"can_issue_legal_doc":true,"can_schedule_consult":true}'::jsonb,
  '["clients","legal_docs","consultations","wallet","network"]'::jsonb, 50),
('other', 'Outro', 'Profissional com configuração personalizada (admin define abas)', 'HelpCircle',
  '{}'::jsonb, '["students","wallet","network"]'::jsonb, 999);

UPDATE public.professional_specialties SET requires_admin_setup = true WHERE key = 'other';

-- 2. Extensão da tabela coaches
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS is_professional BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS specialty_key TEXT REFERENCES public.professional_specialties(key) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS professional_council TEXT,
  ADD COLUMN IF NOT EXISTS council_number TEXT,
  ADD COLUMN IF NOT EXISTS serves_whole_network BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS specialty_pending_setup BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_coaches_specialty_key ON public.coaches(specialty_key) WHERE is_professional = true;

-- 3. Requisitos profissionais por produto
CREATE TABLE public.product_professional_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  specialty_key TEXT NOT NULL REFERENCES public.professional_specialties(key) ON DELETE CASCADE,
  is_required BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, specialty_key)
);

ALTER TABLE public.product_professional_requirements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ppr readable by authenticated"
ON public.product_professional_requirements FOR SELECT TO authenticated USING (true);
CREATE POLICY "ppr manageable by admin"
ON public.product_professional_requirements FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 4. Atribuições por transação
CREATE TABLE public.transaction_professional_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  specialty_key TEXT NOT NULL REFERENCES public.professional_specialties(key) ON DELETE RESTRICT,
  assigned_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  preferred_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  assignment_reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(transaction_id, specialty_key)
);

ALTER TABLE public.transaction_professional_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tpa readable by admin"
ON public.transaction_professional_assignments FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE POLICY "tpa readable by assigned coach"
ON public.transaction_professional_assignments FOR SELECT TO authenticated
USING (assigned_coach_id = public.current_coach_id());

CREATE POLICY "tpa readable by selling coach"
ON public.transaction_professional_assignments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.transactions t
  JOIN public.students s ON s.id = t.student_id
  WHERE t.id = transaction_id AND s.coach_id = public.current_coach_id()
));

CREATE POLICY "tpa manageable by admin"
ON public.transaction_professional_assignments FOR ALL TO authenticated
USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "tpa updatable by assigned coach"
ON public.transaction_professional_assignments FOR UPDATE TO authenticated
USING (assigned_coach_id = public.current_coach_id())
WITH CHECK (assigned_coach_id = public.current_coach_id());

CREATE TRIGGER trg_tpa_updated_at
BEFORE UPDATE ON public.transaction_professional_assignments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_tpa_assigned_coach ON public.transaction_professional_assignments(assigned_coach_id);
CREATE INDEX idx_tpa_specialty ON public.transaction_professional_assignments(specialty_key);

-- 5. Função para escolher o profissional
CREATE OR REPLACE FUNCTION public.pick_professional_for_sale(
  _selling_coach_id UUID,
  _specialty_key TEXT,
  _preferred_coach_id UUID DEFAULT NULL
)
RETURNS TABLE(coach_id UUID, reason TEXT)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _curr UUID;
  _found UUID;
BEGIN
  -- 1) Preferido (deve ser downline direto do vendedor com a especialidade)
  IF _preferred_coach_id IS NOT NULL THEN
    SELECT c.id INTO _found
    FROM public.coaches c
    WHERE c.id = _preferred_coach_id
      AND c.is_professional = true
      AND c.specialty_key = _specialty_key
      AND c.approved_at IS NOT NULL
      AND c.blocked_at IS NULL
      AND c.upline_coach_id = _selling_coach_id
    LIMIT 1;
    IF _found IS NOT NULL THEN
      RETURN QUERY SELECT _found, 'direct_referral_choice'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 2) Vendedor + upline (mais próximo primeiro)
  _curr := _selling_coach_id;
  WHILE _curr IS NOT NULL LOOP
    SELECT c.id INTO _found
    FROM public.coaches c
    WHERE c.id = _curr
      AND c.is_professional = true
      AND c.specialty_key = _specialty_key
      AND c.approved_at IS NOT NULL
      AND c.blocked_at IS NULL
    LIMIT 1;
    IF _found IS NOT NULL THEN
      RETURN QUERY SELECT _found,
        CASE WHEN _curr = _selling_coach_id THEN 'self'::TEXT ELSE 'upline_nearest'::TEXT END;
      RETURN;
    END IF;
    SELECT upline_coach_id INTO _curr FROM public.coaches WHERE id = _curr;
  END LOOP;

  -- 3) Downline direta (1º nível) — mais antigo
  SELECT c.id INTO _found
  FROM public.coaches c
  WHERE c.upline_coach_id = _selling_coach_id
    AND c.is_professional = true
    AND c.specialty_key = _specialty_key
    AND c.approved_at IS NOT NULL
    AND c.blocked_at IS NULL
  ORDER BY c.created_at ASC
  LIMIT 1;
  IF _found IS NOT NULL THEN
    RETURN QUERY SELECT _found, 'direct_downline'::TEXT;
    RETURN;
  END IF;

  -- 4) Fallback global (atende toda a rede)
  SELECT c.id INTO _found
  FROM public.coaches c
  WHERE c.is_professional = true
    AND c.specialty_key = _specialty_key
    AND c.approved_at IS NOT NULL
    AND c.blocked_at IS NULL
    AND c.serves_whole_network = true
  ORDER BY COALESCE(c.total_active_students, 0) ASC, c.created_at ASC
  LIMIT 1;
  IF _found IS NOT NULL THEN
    RETURN QUERY SELECT _found, 'fallback_global'::TEXT;
    RETURN;
  END IF;

  RETURN;
END;
$$;

-- 6. Atribui profissionais quando transação é paga
CREATE OR REPLACE FUNCTION public.assign_professionals_for_transaction(_transaction_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx RECORD;
  _student RECORD;
  _req RECORD;
  _picked RECORD;
  _count INTEGER := 0;
BEGIN
  SELECT * INTO _tx FROM public.transactions WHERE id = _transaction_id;
  IF _tx.id IS NULL OR _tx.product_id IS NULL THEN RETURN 0; END IF;

  SELECT * INTO _student FROM public.students WHERE id = _tx.student_id;
  IF _student.id IS NULL OR _student.coach_id IS NULL THEN RETURN 0; END IF;

  FOR _req IN
    SELECT specialty_key FROM public.product_professional_requirements
    WHERE product_id = _tx.product_id AND is_required = true
  LOOP
    SELECT * INTO _picked FROM public.pick_professional_for_sale(_student.coach_id, _req.specialty_key, NULL);

    INSERT INTO public.transaction_professional_assignments
      (transaction_id, specialty_key, assigned_coach_id, assignment_reason, status)
    VALUES (_transaction_id, _req.specialty_key, _picked.coach_id,
            COALESCE(_picked.reason, 'unassigned'),
            CASE WHEN _picked.coach_id IS NULL THEN 'unassigned' ELSE 'pending' END)
    ON CONFLICT (transaction_id, specialty_key) DO UPDATE
      SET assigned_coach_id = EXCLUDED.assigned_coach_id,
          assignment_reason = EXCLUDED.assignment_reason,
          status = EXCLUDED.status,
          updated_at = now();

    -- Notifica o profissional
    IF _picked.coach_id IS NOT NULL THEN
      INSERT INTO public.notifications (profile_id, type, title, message, action_url)
      SELECT c.profile_id, 'professional_assignment',
             'Novo aluno para atender',
             'Você foi designado como ' || ps.label || ' responsável por uma nova venda.',
             '/professional'
      FROM public.coaches c, public.professional_specialties ps
      WHERE c.id = _picked.coach_id AND ps.key = _req.specialty_key;
    END IF;

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

-- 7. Hook no on_transaction_paid (acrescentando ao existente via novo trigger)
CREATE OR REPLACE FUNCTION public.trg_assign_professionals_on_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM public.assign_professionals_for_transaction(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_professionals_on_paid ON public.transactions;
CREATE TRIGGER trg_assign_professionals_on_paid
AFTER UPDATE OF status ON public.transactions
FOR EACH ROW EXECUTE FUNCTION public.trg_assign_professionals_on_paid();

-- 8. RPC para notificar admin quando profissional escolhe "outro"
CREATE OR REPLACE FUNCTION public.notify_admin_pending_specialty(_coach_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _coach_name TEXT;
  _admin_profile_id UUID;
BEGIN
  SELECT p.name INTO _coach_name
  FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
  WHERE c.id = _coach_id;

  FOR _admin_profile_id IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (profile_id, type, title, message, action_url)
    VALUES (_admin_profile_id, 'professional_setup_required',
            'Profissional precisa de configuração',
            COALESCE(_coach_name, 'Um profissional') || ' escolheu "Outro" como especialidade. Configure as abas do painel.',
            '/admin/professionals');
  END LOOP;
END;
$$;
