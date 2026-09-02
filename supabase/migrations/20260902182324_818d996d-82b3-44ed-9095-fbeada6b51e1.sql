CREATE OR REPLACE FUNCTION public.sync_source_payment_method_from_mp(_kind text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_method text;
BEGIN
  SELECT m.payment_method INTO v_method
    FROM public.mercadopago_payments m
   WHERE m.source_kind = _kind
     AND m.source_id = _id
     AND m.status = 'approved'
   ORDER BY m.created_at DESC
   LIMIT 1;

  IF v_method IS NULL THEN RETURN; END IF;

  IF _kind = 'store_order' THEN
    UPDATE public.store_orders
       SET payment_method = v_method::public.payment_method
     WHERE id = _id
       AND payment_method::text IS DISTINCT FROM v_method;
  ELSIF _kind = 'partner_product_order' THEN
    UPDATE public.partner_product_orders
       SET payment_method = CASE WHEN v_method = 'credit_card' THEN 'card' ELSE v_method END
     WHERE id = _id
       AND payment_method IS DISTINCT FROM (CASE WHEN v_method = 'credit_card' THEN 'card' ELSE v_method END);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_source_payment_method_from_mp(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_source_payment_method_from_mp(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.sync_source_payment_method_from_mp(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_source_payment_method_from_mp(text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_sync_payment_method_from_mp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.source_id IS NOT NULL THEN
    PERFORM public.sync_source_payment_method_from_mp(NEW.source_kind, NEW.source_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_payment_method_from_mp ON public.mercadopago_payments;
CREATE TRIGGER sync_payment_method_from_mp
AFTER INSERT OR UPDATE OF status, payment_method ON public.mercadopago_payments
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_payment_method_from_mp();

UPDATE public.store_orders o
   SET payment_method = m.payment_method::public.payment_method
  FROM public.mercadopago_payments m
 WHERE m.source_kind = 'store_order'
   AND m.source_id = o.id
   AND m.status = 'approved'
   AND o.payment_method::text IS DISTINCT FROM m.payment_method;

UPDATE public.partner_product_orders o
   SET payment_method = CASE WHEN m.payment_method = 'credit_card' THEN 'card' ELSE m.payment_method END
  FROM public.mercadopago_payments m
 WHERE m.source_kind = 'partner_product_order'
   AND m.source_id = o.id
   AND m.status = 'approved'
   AND o.payment_method IS DISTINCT FROM (CASE WHEN m.payment_method = 'credit_card' THEN 'card' ELSE m.payment_method END);
