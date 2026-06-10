
-- 1) Update mark_store_order_paid_and_process to compute fees/tax when zero
CREATE OR REPLACE FUNCTION public.mark_store_order_paid_and_process(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_tx record;
  v_order record;
  v_fallback_product_id uuid;
  v_new_tx_id uuid;
  v_has_tx boolean := false;
  v_pix_fee_pct numeric;
  v_card_fee_pct numeric;
  v_fee_pct numeric;
  v_tax_pct numeric;
  v_fee numeric;
  v_tax numeric;
BEGIN
  UPDATE public.store_orders
  SET status = 'paid'
  WHERE id = _order_id;

  SELECT * INTO v_order FROM public.store_orders WHERE id = _order_id;
  IF v_order.id IS NULL THEN RETURN; END IF;

  -- Compute payment_fee / tax_amount if they are still zero
  IF COALESCE(v_order.payment_fee, 0) = 0
     AND COALESCE(v_order.tax_amount, 0) = 0
     AND COALESCE(v_order.total_amount, 0) > 0 THEN
    SELECT pix_fee_percentage, card_fee_percentage
      INTO v_pix_fee_pct, v_card_fee_pct
      FROM public.payment_fee_configs
     WHERE is_default = true AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1;

    v_fee_pct := CASE
      WHEN COALESCE(v_order.payment_method, 'pix') = 'pix' THEN COALESCE(v_pix_fee_pct, 0.99)
      ELSE COALESCE(v_card_fee_pct, 4.98)
    END;

    SELECT COALESCE(NULLIF(value, '')::numeric, 6)
      INTO v_tax_pct
      FROM public.app_settings
     WHERE key = 'product_default_tax'
     LIMIT 1;
    IF v_tax_pct IS NULL THEN v_tax_pct := 6; END IF;

    v_fee := ROUND(COALESCE(v_order.total_amount, 0) * v_fee_pct / 100.0, 2);
    v_tax := ROUND(GREATEST(0, COALESCE(v_order.total_amount, 0) - v_fee) * v_tax_pct / 100.0, 2);

    UPDATE public.store_orders
       SET payment_fee = v_fee,
           tax_amount = v_tax
     WHERE id = _order_id;

    v_order.payment_fee := v_fee;
    v_order.tax_amount := v_tax;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transactions WHERE metadata->>'store_order_id' = _order_id::text
  ) INTO v_has_tx;

  IF NOT v_has_tx THEN
    SELECT COALESCE(
      (SELECT product_id FROM public.store_order_items
        WHERE order_id = _order_id AND product_id IS NOT NULL LIMIT 1),
      (SELECT id FROM public.products WHERE price IS NOT NULL ORDER BY created_at LIMIT 1)
    ) INTO v_fallback_product_id;

    IF v_fallback_product_id IS NOT NULL THEN
      INSERT INTO public.transactions (
        student_id, product_id, gross_amount, payment_fee, tax_amount, net_amount,
        payment_method, installments, status, purchase_type, metadata, referrer_student_id,
        paid_at
      ) VALUES (
        v_order.student_id,
        v_fallback_product_id,
        COALESCE(v_order.total_amount, 0),
        COALESCE(v_order.payment_fee, 0),
        COALESCE(v_order.tax_amount, 0),
        GREATEST(0, COALESCE(v_order.total_amount, 0) - COALESCE(v_order.payment_fee, 0) - COALESCE(v_order.tax_amount, 0)),
        COALESCE(v_order.payment_method, 'pix'),
        1,
        'paid',
        'store_order',
        jsonb_build_object('store_order_id', _order_id, 'auto_created_by', 'mark_store_order_paid_and_process'),
        v_order.referrer_student_id,
        v_now
      )
      RETURNING id INTO v_new_tx_id;
      PERFORM public.process_paid_transaction(v_new_tx_id);
    END IF;
  END IF;

  FOR v_tx IN
    SELECT id, status, paid_at
    FROM public.transactions
    WHERE metadata->>'store_order_id' = _order_id::text
  LOOP
    -- Sync fee/tax onto the transaction if it's still zero
    UPDATE public.transactions
       SET payment_fee = COALESCE(v_order.payment_fee, 0),
           tax_amount  = COALESCE(v_order.tax_amount, 0),
           net_amount  = GREATEST(0, COALESCE(gross_amount, 0) - COALESCE(v_order.payment_fee, 0) - COALESCE(v_order.tax_amount, 0))
     WHERE id = v_tx.id
       AND (COALESCE(payment_fee, 0) = 0 AND COALESCE(tax_amount, 0) = 0);

    IF v_tx.status IS DISTINCT FROM 'paid' THEN
      UPDATE public.transactions
      SET status = 'paid',
          paid_at = COALESCE(paid_at, v_now)
      WHERE id = v_tx.id;
    ELSIF v_tx.paid_at IS NULL THEN
      UPDATE public.transactions
      SET paid_at = v_now
      WHERE id = v_tx.id;
    END IF;

    PERFORM public.process_paid_transaction(v_tx.id);
  END LOOP;
END;
$function$;

-- 2) Backfill existing paid store_orders that have zero fee/tax
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.store_orders
     WHERE status = 'paid'
       AND COALESCE(payment_fee, 0) = 0
       AND COALESCE(tax_amount, 0) = 0
       AND COALESCE(total_amount, 0) > 0
  LOOP
    PERFORM public.mark_store_order_paid_and_process(r.id);
  END LOOP;
END$$;

-- 3) Reset current month career progress + challenge progress for clean testing
UPDATE public.career_plan_progress
   SET accumulated_points = 0,
       updated_at = now()
 WHERE period_start IS NULL
    OR period_start >= date_trunc('month', now());

UPDATE public.career_challenge_progress
   SET points_in_period = 0,
       achieved_at = NULL,
       updated_at = now()
 WHERE achieved_at IS NULL
    OR achieved_at >= date_trunc('month', now());
