-- Fix set_next_invoice_month: always advance by exactly 1 month from the
-- reference month. The previous "+2 months when paid within reference month"
-- branch caused first-cycle payers to skip an entire month (e.g. paying July
-- as their first invoice pushed next_invoice_month to September, skipping
-- August). generate_monthly_invoices already prevents duplicates via the
-- UNIQUE(user_subscription_id, reference_month) constraint, so a simple
-- +1 month is both correct and safe.
CREATE OR REPLACE FUNCTION public.set_next_invoice_month()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next date;
BEGIN
  IF NEW.status NOT IN ('paid','exempted') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_next := (date_trunc('month', NEW.reference_month) + INTERVAL '1 month')::date;

  UPDATE public.user_subscriptions
    SET next_invoice_month = v_next, updated_at = now()
    WHERE id = NEW.user_subscription_id;

  RETURN NEW;
END;
$$;

-- Backfill: any user_subscription whose next_invoice_month was pushed past
-- (last_paid_reference + 1 month) by the old logic gets corrected.
UPDATE public.user_subscriptions us
SET next_invoice_month = (date_trunc('month', last_ref.max_ref) + INTERVAL '1 month')::date,
    updated_at = now()
FROM (
  SELECT user_subscription_id, MAX(reference_month) AS max_ref
  FROM public.subscription_invoices
  WHERE status IN ('paid','exempted')
  GROUP BY user_subscription_id
) last_ref
WHERE us.id = last_ref.user_subscription_id
  AND us.next_invoice_month IS DISTINCT FROM (date_trunc('month', last_ref.max_ref) + INTERVAL '1 month')::date;