
CREATE OR REPLACE FUNCTION public.find_student_id_by_email(_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF _email IS NULL OR length(trim(_email)) = 0 THEN RETURN NULL; END IF;

  SELECT s.id INTO v_student_id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  JOIN auth.users u ON u.id = p.user_id
  WHERE lower(u.email) = lower(trim(_email))
  LIMIT 1;

  RETURN v_student_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.find_student_id_by_email(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_student_id_by_email(TEXT) TO authenticated;
