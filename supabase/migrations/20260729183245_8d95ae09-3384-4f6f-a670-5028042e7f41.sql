DO $mig$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src
  FROM pg_proc
  WHERE proname = 'process_paid_transaction' AND pronamespace = 'public'::regnamespace;

  IF src IS NULL THEN
    RAISE EXCEPTION 'process_paid_transaction not found';
  END IF;

  IF position('v_release_base' in src) = 0 THEN
    src := replace(src,
      'admin_profile_id UUID; commission_release_days INTEGER := 15;',
      'admin_profile_id UUID; commission_release_days INTEGER := 15;' || chr(10) || '  v_release_base TIMESTAMPTZ;');

    src := replace(src,
      'FROM public.app_settings WHERE key = ''commission_release_days'';',
      'FROM public.app_settings WHERE key = ''commission_release_days'';' || chr(10) ||
      '  v_release_base := COALESCE(tx.paid_at, tx.created_at, NOW());');

    src := replace(src,
      'NOW() + (commission_release_days || '' days'')::INTERVAL',
      'v_release_base + (commission_release_days || '' days'')::INTERVAL');

    IF position('v_release_base := COALESCE' in src) = 0 THEN
      RAISE EXCEPTION 'patch anchor not found in process_paid_transaction';
    END IF;

    EXECUTE src;
  END IF;
END $mig$;