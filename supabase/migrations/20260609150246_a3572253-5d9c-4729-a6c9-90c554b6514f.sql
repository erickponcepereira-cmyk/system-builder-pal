
-- 1) Carteira do aluno indicador: somar SOMENTE comissões cujo beneficiário é o próprio indicador.
CREATE OR REPLACE FUNCTION public.recalc_student_wallet_for_referral(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile uuid;
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total_earned numeric := 0;
BEGIN
  IF _student_id IS NULL THEN RETURN; END IF;

  SELECT profile_id INTO v_profile FROM public.students WHERE id = _student_id;
  IF v_profile IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'pending'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'available'), 0),
    COALESCE(SUM(amount), 0)
  INTO v_pending, v_available, v_total_earned
  FROM public.commissions
  WHERE referred_by_student_id = _student_id
    AND COALESCE(is_referral, false) = true
    AND beneficiary_profile_id = v_profile;

  INSERT INTO public.student_wallets (student_id, pending_balance, available_balance, total_earned, updated_at)
  VALUES (_student_id, v_pending, v_available, v_total_earned, now())
  ON CONFLICT (student_id) DO UPDATE
  SET pending_balance = EXCLUDED.pending_balance,
      available_balance = GREATEST(0, EXCLUDED.available_balance - COALESCE(public.student_wallets.total_withdrawn, 0)),
      total_earned = EXCLUDED.total_earned,
      updated_at = now();
END;
$function$;

-- 2) Pedido pago sem transação: criar transação a partir do pedido antes de distribuir.
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
BEGIN
  UPDATE public.store_orders
  SET status = 'paid'
  WHERE id = _order_id;

  SELECT * INTO v_order FROM public.store_orders WHERE id = _order_id;
  IF v_order.id IS NULL THEN RETURN; END IF;

  -- Verifica se já existe transação para o pedido
  SELECT EXISTS (
    SELECT 1 FROM public.transactions WHERE metadata->>'store_order_id' = _order_id::text
  ) INTO v_has_tx;

  IF NOT v_has_tx THEN
    -- Resolve produto: prioriza item com product_id; senão pega qualquer product
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
