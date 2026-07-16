
CREATE OR REPLACE FUNCTION public.promote_downline_on_coach_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_upline uuid;
BEGIN
  v_new_upline := OLD.upline_coach_id;
  IF v_new_upline IS NULL THEN
    v_new_upline := public.get_system_fallback_coach_id();
  END IF;

  IF v_new_upline IS NOT NULL AND v_new_upline <> OLD.id THEN
    UPDATE public.coaches
       SET upline_coach_id = v_new_upline
     WHERE upline_coach_id = OLD.id;

    UPDATE public.students
       SET coach_id = v_new_upline,
           updated_at = now()
     WHERE coach_id = OLD.id;
  END IF;

  RETURN OLD;
END;
$function$;
