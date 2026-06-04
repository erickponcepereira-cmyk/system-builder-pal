CREATE OR REPLACE FUNCTION public.admin_change_student_coach(_student_id uuid, _new_coach_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  student_profile_id UUID;
  old_coach_profile_id UUID;
  new_coach_profile_id UUID;
  student_coach_id UUID;
  student_partner_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT profile_id INTO student_profile_id FROM public.students WHERE id = _student_id;
  IF student_profile_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  SELECT profile_id INTO new_coach_profile_id FROM public.coaches WHERE id = _new_coach_id AND approved_at IS NOT NULL AND blocked_at IS NULL;
  IF new_coach_profile_id IS NULL THEN
    RAISE EXCEPTION 'Coach destino inválido ou não disponível';
  END IF;

  SELECT c.profile_id INTO old_coach_profile_id
  FROM public.students s
  LEFT JOIN public.coaches c ON c.id = s.coach_id
  WHERE s.id = _student_id;

  UPDATE public.students SET coach_id = _new_coach_id WHERE id = _student_id;

  SELECT id INTO student_coach_id FROM public.coaches WHERE profile_id = student_profile_id;
  IF student_coach_id IS NOT NULL AND student_coach_id <> _new_coach_id THEN
    UPDATE public.coaches
    SET upline_coach_id = _new_coach_id
    WHERE id = student_coach_id;
  END IF;

  SELECT id INTO student_partner_id FROM public.partners WHERE profile_id = student_profile_id;
  IF student_partner_id IS NOT NULL THEN
    UPDATE public.partners
    SET upline_coach_id = _new_coach_id
    WHERE id = student_partner_id;
  END IF;

  IF new_coach_profile_id IS NOT NULL THEN
    INSERT INTO public.notifications (profile_id, type, title, message, action_url)
    VALUES (new_coach_profile_id, 'student_assigned', 'Novo aluno na sua equipe', 'Um aluno foi vinculado à sua equipe pelo administrador.', '/coach');
  END IF;

  IF old_coach_profile_id IS NOT NULL AND old_coach_profile_id <> new_coach_profile_id THEN
    INSERT INTO public.notifications (profile_id, type, title, message, action_url)
    VALUES (old_coach_profile_id, 'student_removed', 'Aluno realocado', 'Um aluno foi realocado para outro coach pelo administrador.', '/coach');
  END IF;

  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  VALUES (student_profile_id, 'coach_changed', 'Coach atualizado', 'Seu coach foi alterado pelo administrador.', '/student');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_change_student_coach(uuid, uuid) TO authenticated;