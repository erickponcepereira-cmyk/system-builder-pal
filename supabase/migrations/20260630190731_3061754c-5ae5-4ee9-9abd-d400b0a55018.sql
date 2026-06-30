
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS user_subscriptions_billing_day_check;
ALTER TABLE public.user_subscriptions ADD CONSTRAINT user_subscriptions_billing_day_check CHECK (billing_day BETWEEN 1 AND 31);

CREATE OR REPLACE FUNCTION public.generate_monthly_invoices()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_ref date := date_trunc('month', CURRENT_DATE)::date;
  r record;
  v_due date;
  v_last_day date;
  v_amount numeric;
BEGIN
  FOR r IN
    SELECT us.id, us.user_id, us.billing_day, us.start_date, us.status, us.exempt_until, us.next_invoice_month
    FROM public.user_subscriptions us
    WHERE us.status IN ('active','exempt_monthly','exempt_annual')
      AND us.start_date <= (v_ref + INTERVAL '1 month - 1 day')::date
      AND (us.next_invoice_month IS NULL OR us.next_invoice_month <= v_ref)
  LOOP
    v_last_day := (v_ref + INTERVAL '1 month - 1 day')::date;
    v_due := LEAST((v_ref + ((r.billing_day - 1) || ' days')::interval)::date, v_last_day);
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
$function$;
