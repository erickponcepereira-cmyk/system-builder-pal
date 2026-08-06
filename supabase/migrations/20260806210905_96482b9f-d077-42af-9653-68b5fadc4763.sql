CREATE OR REPLACE FUNCTION public.ensure_student_for_profile(
  _profile_id uuid,
  _preferred_coach_id uuid DEFAULT NULL::uuid,
  _partner_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid;
  v_current_coach_id uuid;
  v_assignment_pending boolean;
  v_coach_id uuid;
  v_coach_profile_id uuid;
  v_code text;
  v_attempt integer := 0;
BEGIN
  IF _profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF _preferred_coach_id IS NOT NULL THEN
    SELECT id, profile_id
      INTO v_coach_id, v_coach_profile_id
    FROM public.coaches
    WHERE id = _preferred_coach_id
    LIMIT 1;

    IF v_coach_id IS NULL THEN
      RAISE EXCEPTION 'O coach indicador selecionado não foi encontrado.';
    END IF;

    IF v_coach_profile_id = _profile_id THEN
      RAISE EXCEPTION 'Você não pode selecionar a si próprio como coach indicador.';
    END IF;
  END IF;

  SELECT id, coach_id, coach_assignment_pending
    INTO v_student_id, v_current_coach_id, v_assignment_pending
  FROM public.students
  WHERE profile_id = _profile_id
  LIMIT 1;

  IF v_student_id IS NOT NULL THEN
    IF v_coach_id IS NOT NULL AND (COALESCE(v_assignment_pending, false) OR v_current_coach_id IS NULL) THEN
      UPDATE public.students
      SET coach_id = v_coach_id,
          coach_assignment_pending = false,
          partner_id = COALESCE(_partner_id, partner_id),
          updated_at = now()
      WHERE id = v_student_id;
    ELSIF _partner_id IS NOT NULL THEN
      UPDATE public.students
      SET partner_id = COALESCE(partner_id, _partner_id),
          updated_at = now()
      WHERE id = v_student_id;
    END IF;
    RETURN v_student_id;
  END IF;

  v_coach_id := COALESCE(v_coach_id, public.get_system_fallback_coach_id());
  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Não há coach ativo para vincular o perfil de aluno automaticamente.';
  END IF;

  SELECT profile_id INTO v_coach_profile_id
  FROM public.coaches
  WHERE id = v_coach_id;

  IF v_coach_profile_id = _profile_id THEN
    RAISE EXCEPTION 'Você não pode selecionar a si próprio como coach indicador.';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'FC' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    BEGIN
      INSERT INTO public.students (
        profile_id,
        coach_id,
        referral_code,
        referral_link,
        partner_id,
        coach_assignment_pending,
        created_at,
        updated_at
      )
      VALUES (
        _profile_id,
        v_coach_id,
        v_code,
        '/i/' || v_code,
        _partner_id,
        _preferred_coach_id IS NULL,
        now(),
        now()
      )
      RETURNING id INTO v_student_id;
      RETURN v_student_id;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 8 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_student_for_profile(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_student_for_profile(uuid, uuid, uuid) TO service_role;