
-- 1) Allow subscription_invoice_id as a valid origin for system_fee_payouts
ALTER TABLE public.system_fee_payouts
  ADD COLUMN IF NOT EXISTS subscription_invoice_id uuid REFERENCES public.subscription_invoices(id) ON DELETE CASCADE;

ALTER TABLE public.system_fee_payouts DROP CONSTRAINT IF EXISTS system_fee_payouts_source_chk;
ALTER TABLE public.system_fee_payouts
  ADD CONSTRAINT system_fee_payouts_source_chk
  CHECK (transaction_id IS NOT NULL OR partner_order_id IS NOT NULL OR subscription_invoice_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS system_fee_payouts_subscription_invoice_kind_key
  ON public.system_fee_payouts (subscription_invoice_id, kind)
  WHERE subscription_invoice_id IS NOT NULL;

-- 2) Backfill the recurring invoice paid before the fee fix (PIX R$100, fee 0.99%)
DO $$
DECLARE
  v_id uuid := '3df3cdbe-b7c2-4d26-a693-8c99bc04b726';
  v_amount numeric;
  v_old_fee numeric;
  v_old_tax numeric;
  v_old_net numeric;
  v_new_fee numeric;
  v_new_tax numeric;
  v_new_net numeric;
  v_diff_wallet numeric;
BEGIN
  SELECT amount, fee_amount, tax_amount, net_to_admin
    INTO v_amount, v_old_fee, v_old_tax, v_old_net
  FROM public.subscription_invoices WHERE id = v_id;

  IF v_amount IS NULL THEN RETURN; END IF;
  IF v_old_fee > 0 THEN RETURN; END IF;

  v_new_fee := round((v_amount * 0.0099)::numeric, 2);
  v_new_tax := round(((v_amount - v_new_fee) * 0.06)::numeric, 2);
  v_new_net := round((v_amount - v_new_fee - v_new_tax)::numeric, 2);

  -- Insert missing fee entry
  INSERT INTO public.admin_system_wallet_entries(slot_label, amount, kind, notes, subscription_invoice_id)
  VALUES ('Taxa de Pagamento', -v_new_fee, 'payment_fee',
          'Mensalidade ' || to_char((SELECT reference_month FROM public.subscription_invoices WHERE id = v_id), 'MM/YYYY'),
          v_id);

  -- Adjust existing tax entry (-6.00 → -v_new_tax)
  UPDATE public.admin_system_wallet_entries
     SET amount = -v_new_tax
   WHERE subscription_invoice_id = v_id AND kind = 'tax';

  -- Adjust "Mensalidade Recorrente" credit entry to new net (94 → v_new_net)
  UPDATE public.admin_system_wallet_entries
     SET amount = v_new_net
   WHERE subscription_invoice_id = v_id AND kind = 'subscription';

  -- Adjust wallet balance by the delta (old credit 94 vs new 93.07 ⇒ subtract diff)
  v_diff_wallet := v_old_net - v_new_net;  -- positive
  UPDATE public.admin_system_wallet
     SET available_balance = available_balance - v_diff_wallet,
         total_earned = total_earned - v_diff_wallet,
         updated_at = now()
   WHERE id = true;

  UPDATE public.subscription_invoices
     SET fee_amount = v_new_fee,
         tax_amount = v_new_tax,
         net_to_admin = v_new_net,
         updated_at = now()
   WHERE id = v_id;
END $$;
