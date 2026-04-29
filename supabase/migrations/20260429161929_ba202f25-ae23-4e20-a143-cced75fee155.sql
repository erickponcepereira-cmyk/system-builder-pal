-- Phase 10: daily quotes and notifications helpers
CREATE OR REPLACE FUNCTION public.get_or_create_daily_quote()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id UUID;
  current_student_id UUID;
  selected_quote RECORD;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;

  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  SELECT mq.* INTO selected_quote
  FROM public.daily_quote_delivery dqd
  JOIN public.motivational_quotes mq ON mq.id = dqd.quote_id
  WHERE dqd.student_id = current_student_id
    AND dqd.delivered_date = CURRENT_DATE
  LIMIT 1;

  IF selected_quote.id IS NULL THEN
    SELECT mq.* INTO selected_quote
    FROM public.motivational_quotes mq
    WHERE mq.is_active = TRUE
    ORDER BY md5(mq.id::text || CURRENT_DATE::text || current_student_id::text)
    LIMIT 1;

    IF selected_quote.id IS NOT NULL THEN
      INSERT INTO public.daily_quote_delivery (student_id, quote_id, delivered_date)
      VALUES (current_student_id, selected_quote.id, CURRENT_DATE)
      ON CONFLICT (student_id, delivered_date) DO NOTHING;

      INSERT INTO public.notifications (profile_id, type, title, message, action_url)
      VALUES (current_profile_id, 'daily_motivation', 'Frase do dia', selected_quote.quote, '/student/notifications')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'id', selected_quote.id,
    'quote', selected_quote.quote,
    'author', selected_quote.author,
    'category', selected_quote.category
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(_notification_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id UUID;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();

  UPDATE public.notifications
  SET read_at = now()
  WHERE id = _notification_id
    AND profile_id = current_profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id UUID;
  changed_count INTEGER := 0;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();

  UPDATE public.notifications
  SET read_at = now()
  WHERE profile_id = current_profile_id
    AND read_at IS NULL;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_daily_student_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count INTEGER := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  INSERT INTO public.push_notifications_queue (student_id, type, title, body, scheduled_for, data, status)
  SELECT s.id, 'daily_checkin', 'Hora do seu check-in', 'Registre sua presença no desafio e mantenha sua sequência ativa.', CURRENT_DATE + TIME '08:00', jsonb_build_object('url', '/student/challenge'), 'pending'
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.push_notifications_queue q
      WHERE q.student_id = s.id
        AND q.type = 'daily_checkin'
        AND q.scheduled_for::DATE = CURRENT_DATE
    );

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;

-- Phase 11: student-to-coach course and approval flow
CREATE TABLE IF NOT EXISTS public.coach_course_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  material_url TEXT,
  duration_minutes INTEGER DEFAULT 10,
  sort_order INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT TRUE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.coach_course_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  module_id UUID REFERENCES public.coach_course_modules(id) ON DELETE CASCADE NOT NULL,
  completed_at TIMESTAMPTZ DEFAULT now(),
  quiz_score INTEGER,
  notes TEXT,
  UNIQUE(student_id, module_id)
);

CREATE TABLE IF NOT EXISTS public.coach_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  motivation TEXT NOT NULL,
  experience TEXT,
  city TEXT,
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'submitted',
  completed_modules INTEGER DEFAULT 0,
  total_modules INTEGER DEFAULT 0,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_course_progress_student ON public.coach_course_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_coach_applications_status ON public.coach_applications(status);
CREATE INDEX IF NOT EXISTS idx_coach_applications_student ON public.coach_applications(student_id);

ALTER TABLE public.coach_course_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_course_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coach_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coach_course_modules_admin_all ON public.coach_course_modules;
CREATE POLICY coach_course_modules_admin_all ON public.coach_course_modules FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS coach_course_modules_read_active ON public.coach_course_modules;
CREATE POLICY coach_course_modules_read_active ON public.coach_course_modules FOR SELECT TO authenticated USING (is_active = TRUE);

DROP POLICY IF EXISTS coach_course_progress_admin_all ON public.coach_course_progress;
CREATE POLICY coach_course_progress_admin_all ON public.coach_course_progress FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS coach_course_progress_own_all ON public.coach_course_progress;
CREATE POLICY coach_course_progress_own_all ON public.coach_course_progress FOR ALL USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
) WITH CHECK (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS coach_applications_admin_all ON public.coach_applications;
CREATE POLICY coach_applications_admin_all ON public.coach_applications FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS coach_applications_own_select ON public.coach_applications;
CREATE POLICY coach_applications_own_select ON public.coach_applications FOR SELECT USING (
  profile_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
);
DROP POLICY IF EXISTS coach_applications_own_insert ON public.coach_applications;
CREATE POLICY coach_applications_own_insert ON public.coach_applications FOR INSERT WITH CHECK (
  profile_id IN (SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid())
);

CREATE TRIGGER update_coach_course_modules_updated_at
BEFORE UPDATE ON public.coach_course_modules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_coach_applications_updated_at
BEFORE UPDATE ON public.coach_applications
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.mark_coach_course_module_complete(_module_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id UUID;
  current_student_id UUID;
  completed_count INTEGER := 0;
  total_count INTEGER := 0;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;

  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.coach_course_modules WHERE id = _module_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Módulo indisponível';
  END IF;

  INSERT INTO public.coach_course_progress (student_id, module_id)
  VALUES (current_student_id, _module_id)
  ON CONFLICT (student_id, module_id) DO UPDATE SET completed_at = now();

  SELECT COUNT(*)::INTEGER INTO total_count FROM public.coach_course_modules WHERE is_active = TRUE AND is_required = TRUE;
  SELECT COUNT(DISTINCT p.module_id)::INTEGER INTO completed_count
  FROM public.coach_course_progress p
  JOIN public.coach_course_modules m ON m.id = p.module_id
  WHERE p.student_id = current_student_id AND m.is_active = TRUE AND m.is_required = TRUE;

  IF total_count > 0 AND completed_count >= total_count THEN
    UPDATE public.students
    SET completed_coach_course = TRUE,
        coach_course_completed_at = COALESCE(coach_course_completed_at, now())
    WHERE id = current_student_id;

    INSERT INTO public.notifications (profile_id, type, title, message, action_url)
    VALUES (current_profile_id, 'coach_course_completed', 'Curso concluído', 'Você já pode solicitar sua transição para Coach.', '/student/coach-course')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('completed_modules', completed_count, 'total_modules', total_count, 'is_complete', total_count > 0 AND completed_count >= total_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_coach_application(_motivation TEXT, _experience TEXT DEFAULT NULL, _city TEXT DEFAULT NULL, _phone TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile RECORD;
  current_student_id UUID;
  completed_count INTEGER := 0;
  total_count INTEGER := 0;
  new_application_id UUID;
BEGIN
  SELECT * INTO current_profile FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile.id;

  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  SELECT COUNT(*)::INTEGER INTO total_count FROM public.coach_course_modules WHERE is_active = TRUE AND is_required = TRUE;
  SELECT COUNT(DISTINCT p.module_id)::INTEGER INTO completed_count
  FROM public.coach_course_progress p
  JOIN public.coach_course_modules m ON m.id = p.module_id
  WHERE p.student_id = current_student_id AND m.is_active = TRUE AND m.is_required = TRUE;

  IF total_count > 0 AND completed_count < total_count THEN
    RAISE EXCEPTION 'Conclua todos os módulos obrigatórios antes de enviar a solicitação';
  END IF;

  INSERT INTO public.coach_applications (student_id, profile_id, motivation, experience, city, phone, completed_modules, total_modules, status)
  VALUES (current_student_id, current_profile.id, _motivation, _experience, COALESCE(_city, current_profile.city), _phone, completed_count, total_count, 'submitted')
  RETURNING id INTO new_application_id;

  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  SELECT p.id, 'coach_application_submitted', 'Nova solicitação de Coach', current_profile.name || ' concluiu o curso e solicitou aprovação para virar Coach.', '/admin/coach-applications'
  FROM public.profiles p
  WHERE p.role = 'admin';

  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  VALUES (current_profile.id, 'coach_application_submitted', 'Solicitação enviada', 'Sua solicitação para virar Coach foi enviada para análise.', '/student/coach-course');

  RETURN new_application_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_coach_application(_application_id UUID, _status TEXT, _admin_notes TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_profile_id UUID;
  app RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF _status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT * INTO app FROM public.coach_applications WHERE id = _application_id FOR UPDATE;

  IF app.id IS NULL THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  UPDATE public.coach_applications
  SET status = _status,
      reviewed_by = admin_profile_id,
      reviewed_at = now(),
      admin_notes = _admin_notes
  WHERE id = _application_id;

  IF _status = 'approved' THEN
    UPDATE public.profiles
    SET role = 'coach', status = 'pending'
    WHERE id = app.profile_id;

    INSERT INTO public.coaches (profile_id, upline_coach_id, total_active_students, total_sales)
    SELECT app.profile_id, s.coach_id, 0, 0
    FROM public.students s
    WHERE s.id = app.student_id
    ON CONFLICT DO NOTHING;

    INSERT INTO public.notifications (profile_id, type, title, message, action_url)
    VALUES (app.profile_id, 'coach_application_approved', 'Solicitação aprovada', 'Você foi aprovado para iniciar como Coach. Aguarde a ativação final do admin.', '/coach')
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.notifications (profile_id, type, title, message, action_url)
    VALUES (app.profile_id, 'coach_application_rejected', 'Solicitação revisada', COALESCE(_admin_notes, 'Sua solicitação precisa de ajustes antes da aprovação.'), '/student/coach-course')
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

INSERT INTO public.coach_course_modules (title, description, video_url, material_url, duration_minutes, sort_order, is_required, is_active)
SELECT * FROM (VALUES
  ('Mentalidade FitMind', 'Fundamentos do acompanhamento de alunos, disciplina e transformação com responsabilidade.', 'https://fitmind.club/aulas/mentalidade-coach', NULL, 18, 1, TRUE, TRUE),
  ('Captação ética de alunos', 'Como convidar, explicar o desafio e orientar novos alunos sem promessas indevidas.', 'https://fitmind.club/aulas/captacao-etica', NULL, 22, 2, TRUE, TRUE),
  ('Uso da plataforma', 'Fluxo de cadastro, check-ins, grupos, avaliações, pedidos e acompanhamento diário.', 'https://fitmind.club/aulas/plataforma', NULL, 20, 3, TRUE, TRUE),
  ('Rede e comissões', 'Entenda níveis, indicações, carteira, saques, regras de liberação e conduta financeira.', 'https://fitmind.club/aulas/rede-comissoes', NULL, 24, 4, TRUE, TRUE),
  ('Acompanhamento e retenção', 'Rotina semanal, mensagens, leitura de evolução e sinais de risco no desafio.', 'https://fitmind.club/aulas/acompanhamento', NULL, 26, 5, TRUE, TRUE)
) AS seed(title, description, video_url, material_url, duration_minutes, sort_order, is_required, is_active)
WHERE NOT EXISTS (SELECT 1 FROM public.coach_course_modules m WHERE m.title = seed.title);