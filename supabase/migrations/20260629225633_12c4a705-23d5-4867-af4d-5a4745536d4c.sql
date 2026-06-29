CREATE OR REPLACE FUNCTION public.get_system_fallback_coach_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach_id uuid;
BEGIN
  SELECT id INTO v_coach_id
  FROM public.coaches
  WHERE id = 'f9a44c8a-31ea-4ca1-8cef-b9049733c5e1'::uuid
  LIMIT 1;

  IF v_coach_id IS NOT NULL THEN
    RETURN v_coach_id;
  END IF;

  SELECT c.id INTO v_coach_id
  FROM public.coaches c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.role = 'admin'
    AND c.approved_at IS NOT NULL
    AND c.blocked_at IS NULL
  ORDER BY c.created_at ASC
  LIMIT 1;

  IF v_coach_id IS NOT NULL THEN
    RETURN v_coach_id;
  END IF;

  SELECT id INTO v_coach_id
  FROM public.coaches
  WHERE approved_at IS NOT NULL
    AND blocked_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN v_coach_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_student_for_profile(
  _profile_id uuid,
  _preferred_coach_id uuid DEFAULT NULL,
  _partner_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid;
  v_coach_id uuid;
  v_code text;
  v_attempt integer := 0;
BEGIN
  IF _profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_student_id
  FROM public.students
  WHERE profile_id = _profile_id;

  IF v_student_id IS NOT NULL THEN
    IF _partner_id IS NOT NULL THEN
      UPDATE public.students
      SET partner_id = COALESCE(partner_id, _partner_id),
          updated_at = now()
      WHERE id = v_student_id;
    END IF;
    RETURN v_student_id;
  END IF;

  IF _preferred_coach_id IS NOT NULL THEN
    SELECT id INTO v_coach_id
    FROM public.coaches
    WHERE id = _preferred_coach_id
    LIMIT 1;
  END IF;

  v_coach_id := COALESCE(v_coach_id, public.get_system_fallback_coach_id());
  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Não há coach ativo para vincular o perfil de aluno automaticamente.';
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'FC' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    BEGIN
      INSERT INTO public.students (profile_id, coach_id, referral_code, referral_link, partner_id, created_at, updated_at)
      VALUES (_profile_id, v_coach_id, v_code, '/i/' || v_code, _partner_id, now(), now())
      RETURNING id INTO v_student_id;
      RETURN v_student_id;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 8 THEN
        RAISE;
      END IF;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_student_after_coach_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.approved_at IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.approved_at IS DISTINCT FROM NEW.approved_at) THEN
    PERFORM public.ensure_student_for_profile(NEW.profile_id, NEW.upline_coach_id, NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_student_after_coach_approval ON public.coaches;
CREATE TRIGGER trg_ensure_student_after_coach_approval
AFTER INSERT OR UPDATE OF approved_at ON public.coaches
FOR EACH ROW
EXECUTE FUNCTION public.ensure_student_after_coach_approval();

CREATE OR REPLACE FUNCTION public.ensure_student_after_partner_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'approved'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.approved_at IS DISTINCT FROM NEW.approved_at) THEN
    PERFORM public.ensure_student_for_profile(NEW.profile_id, NEW.upline_coach_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_student_after_partner_approval ON public.partners;
CREATE TRIGGER trg_ensure_student_after_partner_approval
AFTER INSERT OR UPDATE OF status, approved_at ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.ensure_student_after_partner_approval();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.profile_id, p.upline_coach_id, p.id AS partner_id
    FROM public.partners p
    LEFT JOIN public.students s ON s.profile_id = p.profile_id
    WHERE p.status = 'approved'
      AND s.id IS NULL
  LOOP
    PERFORM public.ensure_student_for_profile(r.profile_id, r.upline_coach_id, r.partner_id);
  END LOOP;

  FOR r IN
    SELECT c.profile_id, c.upline_coach_id
    FROM public.coaches c
    LEFT JOIN public.students s ON s.profile_id = c.profile_id
    WHERE c.approved_at IS NOT NULL
      AND s.id IS NULL
  LOOP
    PERFORM public.ensure_student_for_profile(r.profile_id, r.upline_coach_id, NULL);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.get_system_fallback_coach_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_student_for_profile(uuid, uuid, uuid) TO authenticated, service_role;