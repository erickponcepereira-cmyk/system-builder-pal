
-- Reprocessa carteiras/comissões de pedidos pagos para refletir os valores corrigidos
DO $$
DECLARE r record; v_paid_at timestamptz;
BEGIN
  FOR r IN
    SELECT id, paid_at FROM public.partner_product_orders
    WHERE status = 'paid'
    ORDER BY paid_at ASC
  LOOP
    BEGIN
      v_paid_at := r.paid_at;
      DELETE FROM public.commissions WHERE partner_order_id = r.id;
      DELETE FROM public.admin_system_wallet_entries WHERE partner_order_id = r.id;
      DELETE FROM public.fitcoin_ledger WHERE source_type = 'partner_order' AND source_id = r.id;
      UPDATE public.partner_product_orders SET paid_at = NULL WHERE id = r.id;
      PERFORM public.process_partner_product_order_paid(r.id);
      UPDATE public.partner_product_orders SET paid_at = v_paid_at WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Falha em %: %', r.id, SQLERRM;
      UPDATE public.partner_product_orders SET paid_at = v_paid_at WHERE id = r.id AND paid_at IS NULL;
    END;
  END LOOP;
END $$;
