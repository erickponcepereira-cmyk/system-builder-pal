DO $mig$
DECLARE
  src text;
  old_snip text;
  new_snip text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'process_paid_transaction' AND n.nspname = 'public';

  old_snip := 'SELECT public.compute_system_fee_points(COALESCE(SUM(amount), 0))
    INTO computed_points
    FROM public.admin_system_wallet_entries
   WHERE transaction_id = _transaction_id AND kind = ''credit'';';

  new_snip := 'SELECT public.compute_system_fee_points(COALESCE(SUM(e.amount), 0))
    INTO computed_points
    FROM public.admin_system_wallet_entries e
   WHERE e.transaction_id = _transaction_id AND e.kind = ''credit''
     AND EXISTS (
       SELECT 1 FROM public.product_value_slots s
        WHERE s.product_id = tx.product_id
          AND s.label = e.slot_label
          AND (COALESCE(s.is_system_fee, false) = true OR s.destination = ''admin_wallet'')
     );';

  IF position(old_snip in src) = 0 THEN
    RAISE EXCEPTION 'trecho de pontos nao encontrado em process_paid_transaction';
  END IF;

  EXECUTE replace(src, old_snip, new_snip);
END
$mig$;