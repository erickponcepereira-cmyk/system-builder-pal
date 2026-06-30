
DO $$
DECLARE r record; v_paid timestamptz;
BEGIN
  FOR r IN SELECT id, paid_at FROM partner_product_orders WHERE status='paid' LOOP
    BEGIN
      v_paid := r.paid_at;
      DELETE FROM commissions WHERE partner_order_id = r.id; -- cascades to fitcoin_ledger
      DELETE FROM admin_system_wallet_entries WHERE partner_order_id = r.id;
      UPDATE partner_product_orders SET paid_at = NULL WHERE id = r.id;
      PERFORM process_partner_product_order_paid(r.id);
      UPDATE partner_product_orders SET paid_at = v_paid WHERE id = r.id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Falha %: %', r.id, SQLERRM;
      UPDATE partner_product_orders SET paid_at = v_paid WHERE id = r.id AND paid_at IS NULL;
    END;
  END LOOP;
END $$;
SELECT order_number, level, amount, slot_label, is_referral
FROM commissions c
JOIN partner_product_orders o ON o.id = c.partner_order_id
WHERE o.order_number IN ('PP-3586903C','PP-F1B66CA5')
ORDER BY order_number, level, is_referral;
