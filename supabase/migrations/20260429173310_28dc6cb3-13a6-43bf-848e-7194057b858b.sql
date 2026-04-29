ALTER TABLE public.coach_applications
ADD COLUMN IF NOT EXISTS selected_upline_coach_id UUID;

CREATE OR REPLACE FUNCTION public.submit_coach_application(
  _motivation text,
  _experience text DEFAULT NULL::text,
  _city text DEFAULT NULL::text,
  _phone text DEFAULT NULL::text,
  _selected_upline_coach_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_profile RECORD;
  current_student_id UUID;
  current_student_coach_id UUID;
  completed_count INTEGER := 0;
  total_count INTEGER := 0;
  new_application_id UUID;
BEGIN
  SELECT * INTO current_profile FROM public.profiles WHERE user_id = auth.uid();
  SELECT id, coach_id INTO current_student_id, current_student_coach_id FROM public.students WHERE profile_id = current_profile.id;

  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF _selected_upline_coach_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.coaches WHERE id = _selected_upline_coach_id AND approved_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Coach indicador inválido';
  END IF;

  SELECT COUNT(*)::INTEGER INTO total_count FROM public.coach_course_modules WHERE is_active = TRUE AND is_required = TRUE;
  SELECT COUNT(DISTINCT p.module_id)::INTEGER INTO completed_count
  FROM public.coach_course_progress p
  JOIN public.coach_course_modules m ON m.id = p.module_id
  WHERE p.student_id = current_student_id AND m.is_active = TRUE AND m.is_required = TRUE;

  IF total_count > 0 AND completed_count < total_count THEN
    RAISE EXCEPTION 'Conclua todos os módulos obrigatórios antes de enviar a solicitação';
  END IF;

  INSERT INTO public.coach_applications (student_id, profile_id, motivation, experience, city, phone, completed_modules, total_modules, status, selected_upline_coach_id)
  VALUES (current_student_id, current_profile.id, _motivation, _experience, COALESCE(_city, current_profile.city), _phone, completed_count, total_count, 'submitted', COALESCE(_selected_upline_coach_id, current_student_coach_id))
  RETURNING id INTO new_application_id;

  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  SELECT p.id, 'coach_application_submitted', 'Nova solicitação de Coach', current_profile.name || ' concluiu o curso e solicitou aprovação para virar Coach.', '/admin/coach-applications'
  FROM public.profiles p
  WHERE p.role = 'admin';

  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  VALUES (current_profile.id, 'coach_application_submitted', 'Solicitação enviada', 'Sua solicitação para virar Coach foi enviada para análise.', '/student/coach-course');

  RETURN new_application_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.review_coach_application(_application_id uuid, _status text, _admin_notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  SELECT ca.*, s.coach_id AS current_student_coach_id INTO app
  FROM public.coach_applications ca
  LEFT JOIN public.students s ON s.id = ca.student_id
  WHERE ca.id = _application_id
  FOR UPDATE OF ca;

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
    VALUES (app.profile_id, COALESCE(app.selected_upline_coach_id, app.current_student_coach_id), 0, 0)
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
$function$;