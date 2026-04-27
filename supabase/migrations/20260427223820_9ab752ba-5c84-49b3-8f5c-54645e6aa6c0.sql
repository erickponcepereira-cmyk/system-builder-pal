ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS purchase_type VARCHAR(30) DEFAULT 'challenge',
  ADD COLUMN IF NOT EXISTS digital_product_id UUID,
  ADD COLUMN IF NOT EXISTS store_product_id UUID,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_transactions_paid_month ON public.transactions (paid_at, status);
CREATE INDEX IF NOT EXISTS idx_transactions_student ON public.transactions (student_id);
CREATE INDEX IF NOT EXISTS idx_commissions_transaction ON public.commissions (transaction_id);

DROP POLICY IF EXISTS "transactions_student_insert" ON public.transactions;
CREATE POLICY "transactions_student_insert"
ON public.transactions
FOR INSERT
TO authenticated
WITH CHECK (
  student_id IN (
    SELECT s.id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "transactions_student_select" ON public.transactions;
CREATE POLICY "transactions_student_select"
ON public.transactions
FOR SELECT
TO authenticated
USING (
  student_id IN (
    SELECT s.id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.process_paid_transaction(_transaction_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx RECORD;
  product RECORD;
  student_row RECORD;
  coach_row RECORD;
  upline_row RECORD;
  commission_release_days INTEGER := 15;
  commission_amount NUMERIC;
  level_percent NUMERIC;
BEGIN
  SELECT * INTO tx FROM public.transactions WHERE id = _transaction_id;
  IF tx.id IS NULL OR tx.status <> 'paid' THEN
    RETURN;
  END IF;

  SELECT * INTO product FROM public.products WHERE id = tx.product_id;
  SELECT * INTO student_row FROM public.students WHERE id = tx.student_id;

  IF tx.purchase_type = 'challenge' AND tx.subscription_id IS NULL THEN
    INSERT INTO public.subscriptions (student_id, product_id, start_date, end_date, status, payment_method, installments)
    VALUES (
      tx.student_id,
      tx.product_id,
      CURRENT_DATE,
      CURRENT_DATE + COALESCE(product.duration_days, 30),
      'active',
      tx.payment_method,
      tx.installments
    )
    RETURNING id INTO tx.subscription_id;

    UPDATE public.transactions SET subscription_id = tx.subscription_id WHERE id = _transaction_id;
  END IF;

  IF tx.purchase_type = 'digital' AND tx.digital_product_id IS NOT NULL THEN
    INSERT INTO public.digital_purchases (student_id, digital_product_id, amount_paid, access_url, expires_at)
    SELECT tx.student_id, dp.id, tx.gross_amount, dp.content_url, now() + make_interval(days => COALESCE(dp.access_days, 365))
    FROM public.digital_products dp
    WHERE dp.id = tx.digital_product_id
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COALESCE(value::INTEGER, 15) INTO commission_release_days
  FROM public.app_settings
  WHERE key = 'commission_release_days';

  DELETE FROM public.commissions WHERE transaction_id = _transaction_id;

  SELECT * INTO coach_row FROM public.coaches WHERE id = student_row.coach_id;
  IF coach_row.id IS NOT NULL THEN
    commission_amount := ROUND(tx.net_amount * COALESCE(product.commission_coach, 0) / 100, 2);
    IF commission_amount > 0 THEN
      INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at)
      VALUES (_transaction_id, coach_row.profile_id, coach_row.id, 0, COALESCE(product.commission_coach, 0), commission_amount, 'pending', now() + make_interval(days => commission_release_days));
    END IF;

    UPDATE public.coaches
    SET total_sales = COALESCE(total_sales, 0) + tx.gross_amount,
        total_active_students = (SELECT COUNT(*) FROM public.students WHERE coach_id = coach_row.id),
        last_activity_at = now()
    WHERE id = coach_row.id;

    upline_row := coach_row;
    FOR i IN 1..3 LOOP
      EXIT WHEN upline_row.upline_coach_id IS NULL;
      SELECT * INTO upline_row FROM public.coaches WHERE id = upline_row.upline_coach_id;
      EXIT WHEN upline_row.id IS NULL;
      level_percent := CASE i
        WHEN 1 THEN COALESCE(product.commission_level1, 0)
        WHEN 2 THEN COALESCE(product.commission_level2, 0)
        ELSE COALESCE(product.commission_level3, 0)
      END;
      commission_amount := ROUND(tx.net_amount * level_percent / 100, 2);
      IF commission_amount > 0 THEN
        INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at)
        VALUES (_transaction_id, upline_row.profile_id, upline_row.id, i, level_percent, commission_amount, 'pending', now() + make_interval(days => commission_release_days));
      END IF;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_transaction_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM public.process_paid_transaction(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_on_transaction_paid ON public.transactions;
CREATE TRIGGER trigger_on_transaction_paid
AFTER UPDATE OF status ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.on_transaction_paid();

CREATE OR REPLACE FUNCTION public.release_available_commissions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count INTEGER;
BEGIN
  UPDATE public.commissions
  SET status = 'available'
  WHERE status = 'pending'
    AND available_at IS NOT NULL
    AND available_at <= now();
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  INSERT INTO public.wallets (profile_id, available_balance, pending_balance, total_earned, updated_at)
  SELECT beneficiary_profile_id, SUM(amount), 0, SUM(amount), now()
  FROM public.commissions
  WHERE status = 'available'
  GROUP BY beneficiary_profile_id
  ON CONFLICT (profile_id) DO UPDATE
  SET available_balance = EXCLUDED.available_balance,
      total_earned = EXCLUDED.total_earned,
      pending_balance = (
        SELECT COALESCE(SUM(c.amount), 0)
        FROM public.commissions c
        WHERE c.beneficiary_profile_id = EXCLUDED.profile_id AND c.status = 'pending'
      ),
      updated_at = now();

  RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_monthly_rankings(_reference_month DATE DEFAULT date_trunc('month', CURRENT_DATE)::DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.monthly_rankings (reference_month, coach_id, new_students, renewed_students, total_students, total_revenue, ranking_position, is_top_seller, qualifies_for_career_plan)
  SELECT
    date_trunc('month', _reference_month)::DATE,
    c.id,
    COUNT(DISTINCT s.id) FILTER (WHERE s.created_at >= date_trunc('month', _reference_month) AND s.created_at < date_trunc('month', _reference_month) + interval '1 month'),
    COUNT(DISTINCT sub.id) FILTER (WHERE sub.created_at >= date_trunc('month', _reference_month) AND sub.created_at < date_trunc('month', _reference_month) + interval '1 month'),
    COUNT(DISTINCT s.id),
    COALESCE(SUM(t.gross_amount) FILTER (WHERE t.status = 'paid' AND t.paid_at >= date_trunc('month', _reference_month) AND t.paid_at < date_trunc('month', _reference_month) + interval '1 month'), 0),
    NULL,
    FALSE,
    FALSE
  FROM public.coaches c
  LEFT JOIN public.students s ON s.coach_id = c.id
  LEFT JOIN public.subscriptions sub ON sub.student_id = s.id
  LEFT JOIN public.transactions t ON t.student_id = s.id
  GROUP BY c.id
  ON CONFLICT (reference_month, coach_id) DO UPDATE
  SET new_students = EXCLUDED.new_students,
      renewed_students = EXCLUDED.renewed_students,
      total_students = EXCLUDED.total_students,
      total_revenue = EXCLUDED.total_revenue;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY total_revenue DESC, total_students DESC) AS pos
    FROM public.monthly_rankings
    WHERE reference_month = date_trunc('month', _reference_month)::DATE
  )
  UPDATE public.monthly_rankings mr
  SET ranking_position = ranked.pos,
      is_top_seller = ranked.pos = 1,
      qualifies_for_career_plan = ranked.pos = 1 AND mr.total_students >= COALESCE((SELECT min_monthly_students FROM public.career_plan_config WHERE is_active = true ORDER BY created_at LIMIT 1), 100)
  FROM ranked
  WHERE mr.id = ranked.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_coach_patents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count INTEGER := 0;
BEGIN
  WITH coach_metrics AS (
    SELECT
      c.id AS coach_id,
      c.profile_id,
      COUNT(DISTINCT direct.id) AS direct_students,
      COUNT(DISTINCT network_students.id) AS network_students,
      COALESCE(SUM(t.gross_amount) FILTER (WHERE t.status = 'paid' AND t.paid_at >= date_trunc('month', CURRENT_DATE)), 0) AS monthly_revenue
    FROM public.coaches c
    LEFT JOIN public.students direct ON direct.coach_id = c.id
    LEFT JOIN public.coaches downline1 ON downline1.upline_coach_id = c.id
    LEFT JOIN public.coaches downline2 ON downline2.upline_coach_id = downline1.id
    LEFT JOIN public.coaches downline3 ON downline3.upline_coach_id = downline2.id
    LEFT JOIN public.students network_students ON network_students.coach_id IN (c.id, downline1.id, downline2.id, downline3.id)
    LEFT JOIN public.transactions t ON t.student_id = direct.id
    GROUP BY c.id, c.profile_id
  ), eligible AS (
    SELECT DISTINCT ON (cm.profile_id)
      cm.profile_id,
      pr.patent
    FROM coach_metrics cm
    JOIN public.patent_rules pr
      ON cm.direct_students >= COALESCE(pr.min_direct_students, 0)
     AND cm.network_students >= COALESCE(pr.min_network_students, 0)
     AND cm.monthly_revenue >= COALESCE(pr.min_monthly_revenue, 0)
    ORDER BY cm.profile_id, pr.sort_order DESC
  )
  UPDATE public.profiles p
  SET patent = eligible.patent,
      report_permissions = COALESCE(p.report_permissions, '{}'::jsonb) || jsonb_build_object('auto_updated_at', now())
  FROM eligible
  WHERE p.id = eligible.profile_id
    AND p.patent IS DISTINCT FROM eligible.patent;

  GET DIAGNOSTICS changed_count = ROW_COUNT;
  RETURN changed_count;
END;
$$;