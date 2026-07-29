DO $mig$
DECLARE d text; old_txt text; new_txt text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname='process_paid_transaction';

  old_txt := '  SELECT * INTO coach_row FROM public.coaches WHERE id = student_row.coach_id;';
  new_txt := '  SELECT * INTO coach_row
  FROM public.coaches c
  WHERE student_row.profile_id IS NOT NULL
    AND c.profile_id = student_row.profile_id
    AND c.approved_at IS NOT NULL
    AND c.blocked_at IS NULL
  ORDER BY c.approved_at ASC
  LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO coach_row FROM public.coaches WHERE id = student_row.coach_id;
  END IF;';

  IF d IS NULL THEN
    RAISE EXCEPTION 'process_paid_transaction not found';
  END IF;

  IF position(old_txt in d) = 0 THEN
    RAISE NOTICE 'seller resolution already patched, skipping';
    RETURN;
  END IF;

  d := replace(d, old_txt, new_txt);
  EXECUTE d;
END
$mig$;