
-- Add next_invoice_month to control grace rule
ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS next_invoice_month date;

-- Trigger: when an invoice becomes paid/exempted, compute next_invoice_month.
-- Rule: if the invoice is settled within its own reference month (on or before
-- the last day of reference_month), the next invoice is generated TWO months
-- after reference_month (skip one month). Otherwise, just the following month.
CREATE OR REPLACE FUNCTION public.set_next_invoice_month()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settled_at date;
  v_ref_last_day date;
  v_next date;
BEGIN
  IF NEW.status NOT IN ('paid','exempted') THEN
    RETURN NEW;
  END IF;
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  v_settled_at := COALESCE(NEW.paid_at::date, CURRENT_DATE);
  v_ref_last_day := (date_trunc('month', NEW.reference_month) + INTERVAL '1 month - 1 day')::date;

  IF v_settled_at <= v_ref_last_day THEN
    -- paid within the reference month -> skip next month
    v_next := (date_trunc('month', NEW.reference_month) + INTERVAL '2 months')::date;
  ELSE
    v_next := (date_trunc('month', NEW.reference_month) + INTERVAL '1 month')::date;
  END IF;

  UPDATE public.user_subscriptions
    SET next_invoice_month = v_next, updated_at = now()
    WHERE id = NEW.user_subscription_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_next_invoice_month ON public.subscription_invoices;
CREATE TRIGGER trg_set_next_invoice_month
AFTER UPDATE OF status ON public.subscription_invoices
FOR EACH ROW EXECUTE FUNCTION public.set_next_invoice_month();

-- Update generate_monthly_invoices to respect next_invoice_month
CREATE OR REPLACE FUNCTION public.generate_monthly_invoices()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_ref date := date_trunc('month', CURRENT_DATE)::date;
  r record;
  v_due date;
  v_amount numeric;
BEGIN
  FOR r IN
    SELECT us.id, us.user_id, us.billing_day, us.start_date, us.status, us.exempt_until, us.next_invoice_month
    FROM public.user_subscriptions us
    WHERE us.status IN ('active','exempt_monthly','exempt_annual')
      AND us.start_date <= (v_ref + INTERVAL '1 month - 1 day')::date
      AND (us.next_invoice_month IS NULL OR us.next_invoice_month <= v_ref)
  LOOP
    v_due := (v_ref + ((r.billing_day - 1) || ' days')::interval)::date;
    v_amount := public.subscription_effective_amount(r.id);

    IF r.status = 'exempt_annual' AND r.exempt_until IS NOT NULL AND v_due <= r.exempt_until THEN
      INSERT INTO public.subscription_invoices(user_subscription_id, user_id, reference_month, due_date, amount, status)
      VALUES (r.id, r.user_id, v_ref, v_due, v_amount, 'exempted')
      ON CONFLICT (user_subscription_id, reference_month) DO NOTHING;
    ELSIF r.status = 'exempt_monthly' THEN
      INSERT INTO public.subscription_invoices(user_subscription_id, user_id, reference_month, due_date, amount, status)
      VALUES (r.id, r.user_id, v_ref, v_due, v_amount, 'exempted')
      ON CONFLICT (user_subscription_id, reference_month) DO NOTHING;
      UPDATE public.user_subscriptions SET status = 'active', updated_at = now() WHERE id = r.id;
    ELSE
      INSERT INTO public.subscription_invoices(user_subscription_id, user_id, reference_month, due_date, amount, status)
      VALUES (r.id, r.user_id, v_ref, v_due, v_amount, 'pending')
      ON CONFLICT (user_subscription_id, reference_month) DO NOTHING;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Backfill: for invoices already paid/exempted, set next_invoice_month
WITH last_settled AS (
  SELECT DISTINCT ON (user_subscription_id)
    user_subscription_id, reference_month, paid_at, status
  FROM public.subscription_invoices
  WHERE status IN ('paid','exempted')
  ORDER BY user_subscription_id, reference_month DESC
)
UPDATE public.user_subscriptions us
SET next_invoice_month = CASE
  WHEN COALESCE(ls.paid_at::date, ls.reference_month) <= (date_trunc('month', ls.reference_month) + INTERVAL '1 month - 1 day')::date
    THEN (date_trunc('month', ls.reference_month) + INTERVAL '2 months')::date
  ELSE (date_trunc('month', ls.reference_month) + INTERVAL '1 month')::date
END
FROM last_settled ls
WHERE us.id = ls.user_subscription_id
  AND us.next_invoice_month IS NULL;
