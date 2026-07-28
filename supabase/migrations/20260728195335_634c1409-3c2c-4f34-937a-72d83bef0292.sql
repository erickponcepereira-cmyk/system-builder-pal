-- 1) Fix stale professor commission lookup inside process_paid_transaction.
DO $$
DECLARE
  fn_sql text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO fn_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'process_paid_transaction'
    AND pg_get_function_identity_arguments(p.oid) = '_transaction_id uuid';

  IF fn_sql IS NULL THEN
    RAISE EXCEPTION 'process_paid_transaction(_transaction_id uuid) not found';
  END IF;

  IF fn_sql LIKE '%ctc.product_id = tx.product_id%' THEN
    fn_sql := replace(
      fn_sql,
      'WHERE ctc.product_id = tx.product_id LIMIT 1;',
      'WHERE ctc.digital_product_id = COALESCE(tx.digital_product_id, tx.product_id) AND COALESCE(ctc.is_active, true) = true LIMIT 1;'
    );
    EXECUTE fn_sql;
  END IF;
END $$;

-- 2) Idempotent annual activation finalizer for store orders.
CREATE OR REPLACE FUNCTION public.apply_annual_activation_for_store_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_activation_product_id uuid := 'b43baf23-76b6-4abc-91a4-2730b3570d77'::uuid;
  v_order record;
  v_profile_id uuid;
  v_paid_at timestamptz;
BEGIN
  SELECT so.id, so.student_id, so.status, so.mp_payment_id
    INTO v_order
  FROM public.store_orders so
  WHERE so.id = _order_id;

  IF v_order.id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.store_order_items soi
    WHERE soi.order_id = _order_id
      AND (
        soi.product_id = v_activation_product_id
        OR soi.store_product_id = v_activation_product_id
        OR soi.digital_product_id = v_activation_product_id
      )
  ) THEN
    RETURN;
  END IF;

  SELECT s.profile_id
    INTO v_profile_id
  FROM public.students s
  WHERE s.id = v_order.student_id;

  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(mp.paid_at, now())
    INTO v_paid_at
  FROM public.mercadopago_payments mp
  WHERE mp.id = v_order.mp_payment_id
    AND mp.status = 'approved'
  LIMIT 1;

  v_paid_at := COALESCE(v_paid_at, now());

  UPDATE public.store_orders
     SET status = 'paid',
         updated_at = now()
   WHERE id = _order_id
     AND status IS DISTINCT FROM 'paid';

  UPDATE public.transactions
     SET status = 'paid',
         paid_at = COALESCE(paid_at, v_paid_at),
         mp_payment_id = COALESCE(mp_payment_id, v_order.mp_payment_id),
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('store_order_id', _order_id)
   WHERE metadata->>'store_order_id' = _order_id::text
     AND status IS DISTINCT FROM 'paid';

  UPDATE public.coaches
     SET activation_paid_at = COALESCE(activation_paid_at, v_paid_at),
         activation_order_id = COALESCE(activation_order_id, _order_id),
         activation_source = COALESCE(NULLIF(activation_source, ''), 'purchased'),
         onboarding_stage = CASE
           WHEN onboarding_stage = 'awaiting_payment' THEN 'awaiting_quiz_result'
           ELSE onboarding_stage
         END
   WHERE profile_id = v_profile_id;

  UPDATE public.partners
     SET activation_paid_at = COALESCE(activation_paid_at, v_paid_at),
         activation_source = COALESCE(NULLIF(activation_source, ''), 'purchased')
   WHERE profile_id = v_profile_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_annual_activation_for_store_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_annual_activation_for_store_order(uuid) TO service_role;

-- 3) Make mark_store_order_paid_and_process call the annual finalizer and avoid rolling back
-- the whole payment when a secondary financial processor fails.
DO $$
DECLARE
  fn_sql text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO fn_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'mark_store_order_paid_and_process'
    AND pg_get_function_identity_arguments(p.oid) = '_order_id uuid';

  IF fn_sql IS NULL THEN
    RAISE EXCEPTION 'mark_store_order_paid_and_process(_order_id uuid) not found';
  END IF;

  IF fn_sql NOT LIKE '%apply_annual_activation_for_store_order(_order_id)%' THEN
    fn_sql := replace(
      fn_sql,
      'IF v_order.id IS NULL THEN RETURN; END IF;',
      'IF v_order.id IS NULL THEN RETURN; END IF;

  PERFORM public.apply_annual_activation_for_store_order(_order_id);'
    );
  END IF;

  IF fn_sql LIKE '%    PERFORM public.process_paid_transaction(v_tx.id);%' AND fn_sql NOT LIKE '%process_paid_transaction failed for store order%' THEN
    fn_sql := replace(
      fn_sql,
      '    PERFORM public.process_paid_transaction(v_tx.id);',
      '    BEGIN
      PERFORM public.process_paid_transaction(v_tx.id);
    EXCEPTION WHEN others THEN
      RAISE WARNING ''process_paid_transaction failed for store order %, transaction %: %'', _order_id, v_tx.id, SQLERRM;
    END;'
    );
  END IF;

  EXECUTE fn_sql;
END $$;

-- Keep privileged execution boundary after CREATE OR REPLACE.
REVOKE EXECUTE ON FUNCTION public.mark_store_order_paid_and_process(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_store_order_paid_and_process(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.process_paid_transaction(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_paid_transaction(uuid) TO service_role;

-- 4) Reprocess approved annual payments that were left pending or without activation.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT so.id AS order_id
    FROM public.store_orders so
    JOIN public.store_order_items soi ON soi.order_id = so.id
    JOIN public.mercadopago_payments mp ON mp.id = so.mp_payment_id
    LEFT JOIN public.students s ON s.id = so.student_id
    LEFT JOIN public.coaches c ON c.profile_id = s.profile_id
    LEFT JOIN public.partners p ON p.profile_id = s.profile_id
    WHERE mp.status = 'approved'
      AND (
        soi.product_id = 'b43baf23-76b6-4abc-91a4-2730b3570d77'::uuid
        OR soi.store_product_id = 'b43baf23-76b6-4abc-91a4-2730b3570d77'::uuid
        OR soi.digital_product_id = 'b43baf23-76b6-4abc-91a4-2730b3570d77'::uuid
      )
      AND (
        so.status IS DISTINCT FROM 'paid'
        OR c.activation_paid_at IS NULL
        OR p.activation_paid_at IS NULL
      )
  LOOP
    PERFORM public.mark_store_order_paid_and_process(r.order_id);
    PERFORM public.apply_annual_activation_for_store_order(r.order_id);
  END LOOP;
END $$;