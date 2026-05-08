CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
RETURNS TABLE (
  valid boolean,
  kind text,
  sponsor_name text,
  coach_id uuid,
  referred_by_student_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := upper(trim(_code));
  _coach RECORD;
  _student RECORD;
BEGIN
  IF _norm IS NULL OR _norm = '' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT c.id AS coach_id, p.name AS coach_name
  INTO _coach
  FROM public.coaches c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE upper(c.referral_code) = _norm
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT true, 'coach'::text, _coach.coach_name, _coach.coach_id, NULL::uuid;
    RETURN;
  END IF;

  SELECT s.id AS student_id, s.coach_id AS coach_id, p.name AS student_name
  INTO _student
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE upper(s.referral_code) = _norm
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT true, 'student'::text, _student.student_name, _student.coach_id, _student.student_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::uuid, NULL::uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon, authenticated;