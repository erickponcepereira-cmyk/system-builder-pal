
CREATE OR REPLACE FUNCTION public.revert_transaction_points(_transaction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  v_paid_month DATE;
  v_gross NUMERIC;
BEGIN
  SELECT date_trunc('month', COALESCE(paid_at, created_at))::DATE, COALESCE(gross_amount,0)
    INTO v_paid_month, v_gross
    FROM public.transactions WHERE id = _transaction_id;

  FOR r IN
    SELECT coach_id, COALESCE(SUM(points),0) AS pts, COUNT(*) AS qty
    FROM public.coach_points_log
    WHERE transaction_id = _transaction_id
    GROUP BY coach_id
  LOOP
    UPDATE public.coaches
    SET total_points = GREATEST(0, COALESCE(total_points,0) - r.pts),
        total_sales  = GREATEST(0, COALESCE(total_sales,0) - r.qty)
    WHERE id = r.coach_id;

    IF v_paid_month IS NOT NULL THEN
      UPDATE public.monthly_rankings
      SET total_points  = GREATEST(0, COALESCE(total_points,0) - r.pts),
          total_revenue = GREATEST(0, COALESCE(total_revenue,0) - v_gross)
      WHERE coach_id = r.coach_id AND reference_month = v_paid_month;
    END IF;
  END LOOP;
END;
$$;

SELECT public.process_paid_transaction('38a5fe06-17cd-458b-99a9-5c263932295f');
SELECT public.process_paid_transaction('6add085b-3585-4d6c-b749-9ea3b0fc9a7b');
