CREATE OR REPLACE FUNCTION public.guard_withdrawal_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _pid uuid;
  _res record;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status NOT IN ('requested','processing','approved') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'student_withdrawal_requests' THEN
    SELECT s.profile_id INTO _pid FROM public.students s WHERE s.id = NEW.student_id;
  ELSE
    _pid := NEW.profile_id;
  END IF;

  IF _pid IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _res FROM public.can_withdraw(_pid);
  IF NOT _res.allowed THEN
    RAISE EXCEPTION 'Saque bloqueado: %', _res.reason USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;