CREATE OR REPLACE FUNCTION public.partner_preview_student(_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT s.id, p.name, COALESCE(p.photo_url, p.avatar_url) AS photo, p.email, p.phone, p.city, p.state
  INTO student_row
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.id = _student_id LIMIT 1;
  IF student_row.id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'student_id', student_row.id,
    'student_name', student_row.name,
    'student_avatar', student_row.photo,
    'student_email', student_row.email,
    'student_phone', student_row.phone,
    'student_city', student_row.city,
    'student_state', student_row.state,
    'partner_name', partner_row.fantasy_name
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.partner_preview_student(uuid) TO authenticated;