REVOKE EXECUTE ON FUNCTION public.process_paid_transaction(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_transaction_paid() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_available_commissions() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_monthly_rankings(DATE) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_coach_patents() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.release_available_commissions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count INTEGER;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

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
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

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
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

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

GRANT EXECUTE ON FUNCTION public.release_available_commissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_monthly_rankings(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_coach_patents() TO authenticated;