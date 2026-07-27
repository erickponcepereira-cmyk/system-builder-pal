CREATE OR REPLACE FUNCTION public.release_due_commissions_cron()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  changed_count INTEGER := 0;
  r record;
BEGIN
  CREATE TEMP TABLE _released_owners ON COMMIT DROP AS
  SELECT DISTINCT beneficiary_profile_id AS pid
  FROM public.commissions
  WHERE status = 'pending'
    AND available_at IS NOT NULL
    AND available_at <= now()
    AND beneficiary_profile_id IS NOT NULL;

  UPDATE public.commissions
  SET status = 'available'
  WHERE status = 'pending'
    AND available_at IS NOT NULL
    AND available_at <= now();
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  FOR r IN SELECT pid FROM _released_owners LOOP
    PERFORM public.recalc_wallets_for_owner(r.pid);
  END LOOP;

  DROP TABLE IF EXISTS _released_owners;

  RETURN changed_count;
END;
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT pid FROM (
      SELECT id AS pid FROM public.profiles
      UNION SELECT beneficiary_profile_id FROM public.commissions WHERE beneficiary_profile_id IS NOT NULL
      UNION SELECT profile_id FROM public.withdrawal_requests WHERE profile_id IS NOT NULL
      UNION SELECT p.profile_id FROM public.partners p JOIN public.partner_wallets w ON w.partner_id = p.id
      UNION SELECT c.profile_id FROM public.coaches c JOIN public.professional_wallets w ON w.professional_coach_id = c.id
    ) x WHERE pid IS NOT NULL
  LOOP
    PERFORM public.recalc_wallets_for_owner(r.pid);
  END LOOP;
END;
$$;