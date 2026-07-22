
DELETE FROM public.commissions c
WHERE (c.transaction_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = c.transaction_id))
  AND (c.partner_order_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.partner_product_orders po WHERE po.id = c.partner_order_id));

ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_transaction_id_fkey;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_transaction_id_fkey
  FOREIGN KEY (transaction_id) REFERENCES public.transactions(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.ensure_commission_has_source()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_id IS NULL AND NEW.partner_order_id IS NULL THEN
    RAISE EXCEPTION 'commission must reference a transaction or partner_order';
  END IF;
  IF NEW.transaction_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.id = NEW.transaction_id) THEN
    RAISE EXCEPTION 'commission transaction_id % does not exist', NEW.transaction_id;
  END IF;
  IF NEW.partner_order_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.partner_product_orders po WHERE po.id = NEW.partner_order_id) THEN
    RAISE EXCEPTION 'commission partner_order_id % does not exist', NEW.partner_order_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_commission_has_source ON public.commissions;
CREATE TRIGGER trg_ensure_commission_has_source
  BEFORE INSERT OR UPDATE OF transaction_id, partner_order_id ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_commission_has_source();

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT DISTINCT beneficiary_profile_id AS id FROM public.commissions WHERE beneficiary_profile_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.recalc_wallet_for_profile(r.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
