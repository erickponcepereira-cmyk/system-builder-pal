CREATE OR REPLACE FUNCTION public.set_store_order_paid_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND NEW.paid_at IS NULL THEN
    NEW.paid_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_store_order_paid_at ON public.store_orders;
CREATE TRIGGER trg_set_store_order_paid_at
BEFORE INSERT OR UPDATE OF status ON public.store_orders
FOR EACH ROW EXECUTE FUNCTION public.set_store_order_paid_at();