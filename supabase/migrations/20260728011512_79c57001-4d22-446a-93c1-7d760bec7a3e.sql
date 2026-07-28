DO $$
DECLARE
  v_order uuid := 'b0d079b0-f028-414f-9eaf-4c413c0fb3f8';
  v_mp    text := '170851036588';
  v_err   text;
BEGIN
  -- garante o ponteiro do pagamento aprovado no pedido
  UPDATE public.store_orders so
     SET mp_payment_id = '11837f89-cfb6-46ef-a8aa-10247aaae6dc'
   WHERE so.id = v_order;

  BEGIN
    PERFORM public.mark_store_order_paid_and_process(v_order);
    RAISE NOTICE 'mark_store_order_paid_and_process OK para %', v_order;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE NOTICE 'FALHA mark_store_order_paid_and_process: %', v_err;
    -- fallback: ao menos marca o pedido como pago para destravar o usuário
    UPDATE public.store_orders
       SET status = 'paid',
           paid_at = COALESCE(paid_at, '2026-07-28 01:02:12+00'::timestamptz)
     WHERE id = v_order AND status <> 'paid';
  END;

  RAISE NOTICE 'mp_payment %', v_mp;
END $$;