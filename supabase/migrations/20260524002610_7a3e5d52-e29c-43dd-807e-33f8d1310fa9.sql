CREATE OR REPLACE FUNCTION public.backfill_career_points()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_tx RECORD;
  v_product RECORD;
  v_student RECORD;
  v_coach_id UUID;
  v_points INTEGER;
  v_month DATE;
  v_processed INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  -- Permissão: apenas admin
  SELECT public.has_role(auth.uid(), 'admin'::app_role) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar o backfill.';
  END IF;

  -- Limpa dados derivados
  DELETE FROM public.coach_points_log;
  DELETE FROM public.monthly_rankings;
  DELETE FROM public.career_plan_progress;
  DELETE FROM public.career_challenge_progress;
  UPDATE public.coaches SET total_points = 0;

  -- Reprocessa cada venda paga em ordem cronológica
  FOR v_tx IN
    SELECT t.id, t.product_id, t.student_id, t.gross_amount, t.net_amount, t.paid_at
    FROM public.transactions t
    WHERE t.status = 'paid'
      AND t.product_id IS NOT NULL
      AND t.student_id IS NOT NULL
    ORDER BY COALESCE(t.paid_at, t.created_at) ASC
  LOOP
    SELECT * INTO v_product FROM public.products WHERE id = v_tx.product_id;
    v_points := COALESCE(v_product.points_per_sale, 0);
    IF v_points <= 0 THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT * INTO v_student FROM public.students WHERE id = v_tx.student_id;
    v_coach_id := v_student.coach_id;
    IF v_coach_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata)
    VALUES (v_coach_id, v_tx.id, v_tx.product_id, v_points, 'sale',
            jsonb_build_object('product_name', v_product.name, 'gross_amount', v_tx.gross_amount, 'backfill', TRUE));

    UPDATE public.coaches
    SET total_points = COALESCE(total_points, 0) + v_points
    WHERE id = v_coach_id;

    v_month := date_trunc('month', COALESCE(v_tx.paid_at, NOW()))::DATE;
    PERFORM public.upsert_monthly_ranking_on_sale(
      v_coach_id, v_points,
      COALESCE(v_tx.net_amount, v_tx.gross_amount, 0),
      v_month
    );
    PERFORM public.update_career_period_plans(v_coach_id, v_points);
    PERFORM public.update_career_challenge_progress(v_coach_id, v_points);

    v_processed := v_processed + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'processed', v_processed,
    'skipped', v_skipped,
    'ran_at', NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_career_points() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_career_points() TO authenticated;