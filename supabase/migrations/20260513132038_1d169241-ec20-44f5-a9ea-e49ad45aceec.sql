
-- Phase 4: Career plan by points
ALTER TABLE public.career_plan_config
  ADD COLUMN IF NOT EXISTS min_monthly_points INTEGER NOT NULL DEFAULT 75;

ALTER TABLE public.monthly_rankings
  ADD COLUMN IF NOT EXISTS total_points INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.refresh_monthly_rankings(_reference_month date DEFAULT (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _required_points INTEGER;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COALESCE(min_monthly_points, 75) INTO _required_points
  FROM public.career_plan_config
  WHERE is_active = true
  ORDER BY created_at
  LIMIT 1;
  _required_points := COALESCE(_required_points, 75);

  INSERT INTO public.monthly_rankings (
    reference_month, coach_id, new_students, renewed_students, total_students,
    total_revenue, total_points, ranking_position, is_top_seller, qualifies_for_career_plan
  )
  SELECT
    date_trunc('month', _reference_month)::DATE,
    c.id,
    COUNT(DISTINCT s.id) FILTER (WHERE s.created_at >= date_trunc('month', _reference_month) AND s.created_at < date_trunc('month', _reference_month) + interval '1 month'),
    COUNT(DISTINCT sub.id) FILTER (WHERE sub.created_at >= date_trunc('month', _reference_month) AND sub.created_at < date_trunc('month', _reference_month) + interval '1 month'),
    COUNT(DISTINCT s.id),
    COALESCE(SUM(t.gross_amount) FILTER (WHERE t.status = 'paid' AND t.paid_at >= date_trunc('month', _reference_month) AND t.paid_at < date_trunc('month', _reference_month) + interval '1 month'), 0),
    COALESCE((
      SELECT SUM(cpl.points)
      FROM public.coach_points_log cpl
      WHERE cpl.coach_id = c.id
        AND cpl.created_at >= date_trunc('month', _reference_month)
        AND cpl.created_at < date_trunc('month', _reference_month) + interval '1 month'
    ), 0)::INTEGER,
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
      total_revenue = EXCLUDED.total_revenue,
      total_points = EXCLUDED.total_points;

  -- Rank by points (primary) and revenue (tiebreaker); qualification uses points
  WITH ranked AS (
    SELECT id, total_points,
           ROW_NUMBER() OVER (ORDER BY total_points DESC, total_revenue DESC, total_students DESC) AS pos
    FROM public.monthly_rankings
    WHERE reference_month = date_trunc('month', _reference_month)::DATE
  )
  UPDATE public.monthly_rankings mr
  SET ranking_position = ranked.pos,
      is_top_seller = (ranked.pos = 1),
      qualifies_for_career_plan = (mr.total_points >= _required_points)
  FROM ranked
  WHERE mr.id = ranked.id;
END;
$function$;
