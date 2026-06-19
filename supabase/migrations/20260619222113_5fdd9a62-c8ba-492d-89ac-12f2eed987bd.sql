CREATE OR REPLACE FUNCTION public.recalculate_student_card_access(_student_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_until timestamptz := NULL;
  v_base timestamptz;
BEGIN
  IF _student_id IS NULL THEN
    RETURN NULL;
  END IF;

  FOR r IN
    SELECT
      COALESCE(t.paid_at, t.created_at) AS paid_at,
      GREATEST(0, COALESCE(p.card_access_days, 0))::integer AS days
    FROM public.transactions t
    JOIN public.products p ON p.id = t.product_id
    WHERE t.student_id = _student_id
      AND t.status = 'paid'
      AND COALESCE(p.card_access_days, 0) > 0
      AND COALESCE(t.paid_at, t.created_at) IS NOT NULL
    ORDER BY COALESCE(t.paid_at, t.created_at), t.created_at, t.id
  LOOP
    v_base := GREATEST(COALESCE(v_until, r.paid_at), r.paid_at);
    v_until := v_base + make_interval(days => r.days);
  END LOOP;

  UPDATE public.students
  SET card_valid_until = v_until
  WHERE id = _student_id;

  RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_student_card_access(_student_id uuid, _days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recalculated timestamptz;
  v_current timestamptz;
  v_base timestamptz;
BEGIN
  IF _days IS NULL OR _days <= 0 OR _student_id IS NULL THEN
    RETURN;
  END IF;

  v_recalculated := public.recalculate_student_card_access(_student_id);
  IF v_recalculated IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT card_valid_until INTO v_current
  FROM public.students
  WHERE id = _student_id;

  v_base := GREATEST(COALESCE(v_current, now()), now());
  UPDATE public.students
  SET card_valid_until = v_base + make_interval(days => _days)
  WHERE id = _student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalculate_coach_card_access(_coach_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_profile_id uuid;
  v_until timestamptz := NULL;
  v_base timestamptz;
BEGIN
  IF _coach_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT profile_id INTO v_profile_id
  FROM public.coaches
  WHERE id = _coach_id;

  IF v_profile_id IS NULL THEN
    RETURN NULL;
  END IF;

  FOR r IN
    SELECT
      COALESCE(t.paid_at, t.created_at) AS paid_at,
      COALESCE(NULLIF(p.card_access_days, 0), 365)::integer AS days
    FROM public.transactions t
    JOIN public.students s ON s.id = t.student_id
    JOIN public.products p ON p.id = t.product_id
    WHERE s.profile_id = v_profile_id
      AND t.status = 'paid'
      AND p.product_type IN ('coach_training', 'health_pro_course')
      AND COALESCE(t.paid_at, t.created_at) IS NOT NULL
    ORDER BY COALESCE(t.paid_at, t.created_at), t.created_at, t.id
  LOOP
    v_base := GREATEST(COALESCE(v_until, r.paid_at), r.paid_at);
    v_until := v_base + make_interval(days => r.days);
  END LOOP;

  UPDATE public.coaches
  SET card_valid_until = v_until
  WHERE id = _coach_id;

  RETURN v_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_coach_card_access(_coach_id uuid, _days integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_recalculated timestamptz;
  v_current timestamptz;
  v_base timestamptz;
BEGIN
  IF _days IS NULL OR _days <= 0 OR _coach_id IS NULL THEN
    RETURN;
  END IF;

  v_recalculated := public.recalculate_coach_card_access(_coach_id);
  IF v_recalculated IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT card_valid_until INTO v_current
  FROM public.coaches
  WHERE id = _coach_id;

  v_base := GREATEST(COALESCE(v_current, now()), now());
  UPDATE public.coaches
  SET card_valid_until = v_base + make_interval(days => _days)
  WHERE id = _coach_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalculate_student_card_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_coach_card_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_student_card_access(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_coach_card_access(uuid) TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT t.student_id
    FROM public.transactions t
    JOIN public.products p ON p.id = t.product_id
    WHERE t.student_id IS NOT NULL
      AND t.status = 'paid'
      AND COALESCE(p.card_access_days, 0) > 0
  LOOP
    PERFORM public.recalculate_student_card_access(r.student_id);
  END LOOP;

  FOR r IN
    SELECT DISTINCT c.id AS coach_id
    FROM public.coaches c
    JOIN public.students s ON s.profile_id = c.profile_id
    JOIN public.transactions t ON t.student_id = s.id
    JOIN public.products p ON p.id = t.product_id
    WHERE t.status = 'paid'
      AND p.product_type IN ('coach_training', 'health_pro_course')
  LOOP
    PERFORM public.recalculate_coach_card_access(r.coach_id);
  END LOOP;
END;
$$;