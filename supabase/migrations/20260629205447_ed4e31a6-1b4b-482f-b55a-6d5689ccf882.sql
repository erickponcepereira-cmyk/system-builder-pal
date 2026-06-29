CREATE OR REPLACE FUNCTION public.set_created_at_from_transaction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ts timestamptz;
BEGIN
  IF NEW.transaction_id IS NOT NULL THEN
    SELECT COALESCE(t.paid_at, t.created_at) INTO v_ts
    FROM public.transactions t
    WHERE t.id = NEW.transaction_id;
    IF v_ts IS NOT NULL THEN
      NEW.created_at := v_ts;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_commission_created_at_from_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ts timestamptz;
BEGIN
  IF NEW.transaction_id IS NOT NULL THEN
    SELECT COALESCE(t.paid_at, t.created_at) INTO v_ts
    FROM public.transactions t
    WHERE t.id = NEW.transaction_id;
  ELSIF NEW.partner_order_id IS NOT NULL THEN
    SELECT COALESCE(o.paid_at, o.created_at) INTO v_ts
    FROM public.partner_product_orders o
    WHERE o.id = NEW.partner_order_id;
  END IF;

  IF v_ts IS NOT NULL THEN
    NEW.created_at := v_ts;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_admin_wallet_entry_created_at_from_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ts timestamptz;
BEGIN
  IF NEW.transaction_id IS NOT NULL THEN
    SELECT COALESCE(t.paid_at, t.created_at) INTO v_ts
    FROM public.transactions t
    WHERE t.id = NEW.transaction_id;
  ELSIF NEW.partner_order_id IS NOT NULL THEN
    SELECT COALESCE(o.paid_at, o.created_at) INTO v_ts
    FROM public.partner_product_orders o
    WHERE o.id = NEW.partner_order_id;
  ELSIF NEW.subscription_invoice_id IS NOT NULL THEN
    SELECT COALESCE(i.paid_at, i.updated_at, i.created_at) INTO v_ts
    FROM public.subscription_invoices i
    WHERE i.id = NEW.subscription_invoice_id;
  END IF;

  IF v_ts IS NOT NULL THEN
    NEW.created_at := v_ts;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_business_created_at ON public.commissions;
CREATE TRIGGER trg_commissions_business_created_at
BEFORE INSERT ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.set_commission_created_at_from_source();

DROP TRIGGER IF EXISTS trg_admin_wallet_entries_business_created_at ON public.admin_system_wallet_entries;
CREATE TRIGGER trg_admin_wallet_entries_business_created_at
BEFORE INSERT ON public.admin_system_wallet_entries
FOR EACH ROW EXECUTE FUNCTION public.set_admin_wallet_entry_created_at_from_source();

DROP TRIGGER IF EXISTS trg_coach_points_business_created_at ON public.coach_points_log;
CREATE TRIGGER trg_coach_points_business_created_at
BEFORE INSERT ON public.coach_points_log
FOR EACH ROW EXECUTE FUNCTION public.set_created_at_from_transaction();

DROP TRIGGER IF EXISTS trg_nutritionist_entries_business_created_at ON public.nutritionist_blocked_entries;
CREATE TRIGGER trg_nutritionist_entries_business_created_at
BEFORE INSERT ON public.nutritionist_blocked_entries
FOR EACH ROW EXECUTE FUNCTION public.set_created_at_from_transaction();

DROP TRIGGER IF EXISTS trg_professor_entries_business_created_at ON public.professor_blocked_entries;
CREATE TRIGGER trg_professor_entries_business_created_at
BEFORE INSERT ON public.professor_blocked_entries
FOR EACH ROW EXECUTE FUNCTION public.set_created_at_from_transaction();

DROP TRIGGER IF EXISTS trg_product_pool_business_created_at ON public.product_order_pool_entries;
CREATE TRIGGER trg_product_pool_business_created_at
BEFORE INSERT ON public.product_order_pool_entries
FOR EACH ROW EXECUTE FUNCTION public.set_created_at_from_transaction();

UPDATE public.commissions c
SET created_at = COALESCE(t.paid_at, t.created_at)
FROM public.transactions t
WHERE c.transaction_id = t.id
  AND c.created_at IS DISTINCT FROM COALESCE(t.paid_at, t.created_at);

UPDATE public.commissions c
SET created_at = COALESCE(o.paid_at, o.created_at)
FROM public.partner_product_orders o
WHERE c.partner_order_id = o.id
  AND c.created_at IS DISTINCT FROM COALESCE(o.paid_at, o.created_at);

UPDATE public.admin_system_wallet_entries e
SET created_at = COALESCE(t.paid_at, t.created_at)
FROM public.transactions t
WHERE e.transaction_id = t.id
  AND e.created_at IS DISTINCT FROM COALESCE(t.paid_at, t.created_at);

UPDATE public.admin_system_wallet_entries e
SET created_at = COALESCE(o.paid_at, o.created_at)
FROM public.partner_product_orders o
WHERE e.partner_order_id = o.id
  AND e.created_at IS DISTINCT FROM COALESCE(o.paid_at, o.created_at);

UPDATE public.admin_system_wallet_entries e
SET created_at = COALESCE(i.paid_at, i.updated_at, i.created_at)
FROM public.subscription_invoices i
WHERE e.subscription_invoice_id = i.id
  AND e.created_at IS DISTINCT FROM COALESCE(i.paid_at, i.updated_at, i.created_at);

UPDATE public.coach_points_log l
SET created_at = COALESCE(t.paid_at, t.created_at)
FROM public.transactions t
WHERE l.transaction_id = t.id
  AND l.created_at IS DISTINCT FROM COALESCE(t.paid_at, t.created_at);

UPDATE public.nutritionist_blocked_entries e
SET created_at = COALESCE(t.paid_at, t.created_at)
FROM public.transactions t
WHERE e.transaction_id = t.id
  AND e.created_at IS DISTINCT FROM COALESCE(t.paid_at, t.created_at);

UPDATE public.professor_blocked_entries e
SET created_at = COALESCE(t.paid_at, t.created_at)
FROM public.transactions t
WHERE e.transaction_id = t.id
  AND e.created_at IS DISTINCT FROM COALESCE(t.paid_at, t.created_at);

UPDATE public.product_order_pool_entries e
SET created_at = COALESCE(t.paid_at, t.created_at)
FROM public.transactions t
WHERE e.transaction_id = t.id
  AND e.created_at IS DISTINCT FROM COALESCE(t.paid_at, t.created_at);