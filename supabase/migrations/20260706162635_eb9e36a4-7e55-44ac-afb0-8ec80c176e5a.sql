
-- 1) Corrige a lógica de geração
CREATE OR REPLACE FUNCTION public.generate_monthly_invoices()
RETURNS int
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
    SELECT us.id, us.user_id, us.billing_day, us.start_date, us.status, us.exempt_until
    FROM public.user_subscriptions us
    WHERE us.status IN ('active','exempt_monthly','exempt_annual')
      AND us.start_date <= (v_ref + INTERVAL '1 month - 1 day')::date
  LOOP
    v_due := (v_ref + ((r.billing_day - 1) || ' days')::interval)::date;

    -- Não cobrar mês cujo vencimento já passou antes do usuário se tornar assinante
    IF r.start_date > v_due THEN
      CONTINUE;
    END IF;

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

-- 2) Cancela faturas retroativas geradas indevidamente (não pagas/não isentas)
UPDATE public.subscription_invoices si
SET status = 'cancelled', updated_at = now()
FROM public.user_subscriptions us
WHERE si.user_subscription_id = us.id
  AND si.due_date < us.start_date
  AND si.status NOT IN ('paid','exempted','cancelled');
