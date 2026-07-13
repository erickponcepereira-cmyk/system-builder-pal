
-- 1) Ajusta ensure_user_subscription para também gerar fatura do mês atual
CREATE OR REPLACE FUNCTION public.ensure_user_subscription(
  _user_id uuid,
  _billing_day int DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_sub_id uuid;
  v_ref date := date_trunc('month', CURRENT_DATE)::date;
  v_due date;
  v_amount numeric;
  v_billing_day int;
BEGIN
  SELECT id INTO v_sub_id FROM public.user_subscriptions WHERE user_id = _user_id;
  IF v_sub_id IS NULL THEN
    SELECT id INTO v_plan_id FROM public.subscription_plans WHERE active = true ORDER BY created_at LIMIT 1;
    IF v_plan_id IS NULL THEN
      RAISE EXCEPTION 'No active subscription plan';
    END IF;

    INSERT INTO public.user_subscriptions(user_id, plan_id, billing_day)
    VALUES (_user_id, v_plan_id, GREATEST(1, LEAST(28, _billing_day)))
    RETURNING id INTO v_sub_id;
  END IF;

  -- Garante a fatura do mês corrente para essa assinatura (idempotente)
  SELECT billing_day INTO v_billing_day FROM public.user_subscriptions WHERE id = v_sub_id;
  v_due := (v_ref + ((COALESCE(v_billing_day,5) - 1) || ' days')::interval)::date;
  v_amount := public.subscription_effective_amount(v_sub_id);

  INSERT INTO public.subscription_invoices(user_subscription_id, user_id, reference_month, due_date, amount, status)
  VALUES (v_sub_id, _user_id, v_ref, v_due, v_amount, 'pending')
  ON CONFLICT (user_subscription_id, reference_month) DO NOTHING;

  RETURN v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_subscription(uuid, int) TO authenticated, service_role;

-- 2) Backfill: gera faturas do mês corrente para qualquer assinatura ativa que ainda não tenha
SELECT public.generate_monthly_invoices();

-- 3) Backfill adicional: para assinaturas active sem fatura corrente (por serem novas), força criação
DO $$
DECLARE r record;
  v_ref date := date_trunc('month', CURRENT_DATE)::date;
  v_due date;
  v_amount numeric;
BEGIN
  FOR r IN
    SELECT us.id, us.user_id, us.billing_day
    FROM public.user_subscriptions us
    WHERE us.status IN ('active','exempt_monthly')
      AND NOT EXISTS (
        SELECT 1 FROM public.subscription_invoices si
        WHERE si.user_subscription_id = us.id AND si.reference_month = v_ref
      )
  LOOP
    v_due := (v_ref + ((COALESCE(r.billing_day,5) - 1) || ' days')::interval)::date;
    v_amount := public.subscription_effective_amount(r.id);
    INSERT INTO public.subscription_invoices(user_subscription_id, user_id, reference_month, due_date, amount, status)
    VALUES (r.id, r.user_id, v_ref, v_due, v_amount, 'pending')
    ON CONFLICT (user_subscription_id, reference_month) DO NOTHING;
  END LOOP;
END $$;
