CREATE OR REPLACE FUNCTION public.partner_scan_student(_student_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  curr_profile_id UUID;
  partner_row RECORD;
  student_row RECORD;
BEGIN
  SELECT id INTO curr_profile_id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF curr_profile_id IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;

  SELECT id, fantasy_name, status INTO partner_row FROM public.partners
  WHERE profile_id = curr_profile_id LIMIT 1;
  IF partner_row.id IS NULL THEN
    RAISE EXCEPTION 'Apenas empresas parceiras podem validar QR de alunos';
  END IF;
  IF partner_row.status <> 'approved' THEN
    RAISE EXCEPTION 'Empresa parceira ainda não aprovada';
  END IF;

  SELECT s.id, p.name, p.avatar_url, p.email
  INTO student_row
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.id = _student_id LIMIT 1;
  IF student_row.id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  INSERT INTO public.partner_visits (partner_id, student_id, source)
  VALUES (partner_row.id, student_row.id, 'partner_scan');

  INSERT INTO public.attendance_logs (student_id, log_date, attended, activity_type, notes)
  VALUES (student_row.id, CURRENT_DATE, true, 'partner_visit', 'Visita à empresa parceira: ' || partner_row.fantasy_name)
  ON CONFLICT (student_id, log_date, activity_type) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'student_id', student_row.id,
    'student_name', student_row.name,
    'student_avatar', student_row.avatar_url,
    'partner_name', partner_row.fantasy_name,
    'visited_at', now()
  );
END;
$$;

DROP POLICY IF EXISTS "partner_visits_partner_insert" ON public.partner_visits;
CREATE POLICY "partner_visits_partner_insert" ON public.partner_visits
FOR INSERT TO authenticated
WITH CHECK (partner_id IN (SELECT id FROM public.partners WHERE profile_id = public.current_profile_id()));