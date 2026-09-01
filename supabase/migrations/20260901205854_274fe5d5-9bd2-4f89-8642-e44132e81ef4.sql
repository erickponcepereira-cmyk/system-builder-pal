DO $do$
DECLARE
  src TEXT;
  hits INT;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src
  FROM pg_proc WHERE proname = 'process_paid_transaction'
    AND pronamespace = 'public'::regnamespace;

  IF src IS NULL THEN
    RAISE EXCEPTION 'process_paid_transaction nao encontrada';
  END IF;

  IF position('v_qty' in src) > 0 THEN
    RAISE NOTICE 'ja aplicado';
    RETURN;
  END IF;

  src := replace(src,
    '  v_professor_profile UUID;',
    '  v_professor_profile UUID;' || E'\n' || '  v_qty INTEGER := 1;');
  IF position('v_qty INTEGER' in src) = 0 THEN
    RAISE EXCEPTION 'nao foi possivel declarar v_qty';
  END IF;

  src := replace(src,
    '  base_distributable := GREATEST(0,',
    '  SELECT GREATEST(1, COALESCE(SUM(i.quantity), 1))::int INTO v_qty' || E'\n' ||
    '  FROM public.store_order_items i' || E'\n' ||
    '  WHERE i.order_id::text = tx.metadata->>''store_order_id'';' || E'\n\n' ||
    '  base_distributable := GREATEST(0,');
  IF position('INTO v_qty' in src) = 0 THEN
    RAISE EXCEPTION 'nao foi possivel calcular v_qty';
  END IF;

  SELECT count(*) INTO hits
  FROM regexp_matches(src, 'WHEN ''fixed''\s+THEN slot\.value_amount(?!\s*\*)', 'g');
  IF hits <> 2 THEN
    RAISE EXCEPTION 'esperava 2 ramos fixed, achei %', hits;
  END IF;

  src := regexp_replace(src,
    '(WHEN ''fixed''\s+THEN slot\.value_amount)(\s*$)',
    '\1 * v_qty\2', 'gn');

  EXECUTE src;
END
$do$;