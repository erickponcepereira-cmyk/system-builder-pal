
-- 1) Remove hardcoded Erick fallback; use oldest approved admin coach
CREATE OR REPLACE FUNCTION public.get_system_fallback_coach_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach_id uuid;
BEGIN
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

-- 2) Trigger: on coach delete, promote downline coaches and students to the deleted coach's upline
CREATE OR REPLACE FUNCTION public.promote_downline_on_coach_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_upline uuid;
BEGIN
  -- Prefer the deleted coach's own upline; fall back to system fallback only if null
  v_new_upline := OLD.upline_coach_id;
  IF v_new_upline IS NULL THEN
    v_new_upline := public.get_system_fallback_coach_id();
  END IF;

  IF v_new_upline IS NOT NULL AND v_new_upline <> OLD.id THEN
    UPDATE public.coaches
       SET upline_coach_id = v_new_upline,
           updated_at = now()
     WHERE upline_coach_id = OLD.id;

    UPDATE public.students
       SET coach_id = v_new_upline,
           updated_at = now()
     WHERE coach_id = OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_promote_downline_on_coach_delete ON public.coaches;
CREATE TRIGGER trg_promote_downline_on_coach_delete
BEFORE DELETE ON public.coaches
FOR EACH ROW
EXECUTE FUNCTION public.promote_downline_on_coach_delete();
