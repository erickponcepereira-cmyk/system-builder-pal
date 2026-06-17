CREATE OR REPLACE FUNCTION public.extend_user_membership_cards(_user_id uuid, _days integer DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile_id uuid;
  v_now timestamptz := now();
  v_cur timestamptz;
  v_base timestamptz;
BEGIN
  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE user_id = _user_id;

  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  SELECT card_valid_until INTO v_cur
  FROM public.coaches
  WHERE profile_id = v_profile_id;

  IF FOUND THEN
    v_base := GREATEST(COALESCE(v_cur, v_now), v_now);
    UPDATE public.coaches
    SET card_valid_until = v_base + (_days || ' days')::interval
    WHERE profile_id = v_profile_id;
  END IF;

  SELECT card_valid_until INTO v_cur
  FROM public.partners
  WHERE profile_id = v_profile_id;

  IF FOUND THEN
    v_base := GREATEST(COALESCE(v_cur, v_now), v_now);
    UPDATE public.partners
    SET card_valid_until = v_base + (_days || ' days')::interval,
        updated_at = now()
    WHERE profile_id = v_profile_id;
  END IF;
END;
$$;