CREATE OR REPLACE FUNCTION public.enforce_product_network_restriction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_restrict boolean := false;
  v_allowed uuid[] := '{}'::uuid[];
  v_owner_coach uuid;
  v_profile uuid;
  v_chain uuid[] := '{}'::uuid[];
BEGIN
  IF NEW.partner_product_id IS NOT NULL THEN
    SELECT COALESCE(restrict_to_networks,false), COALESCE(allowed_coach_ids,'{}'::uuid[])
      INTO v_restrict, v_allowed
      FROM public.partner_products WHERE id = NEW.partner_product_id;
  ELSIF NEW.professional_product_id IS NOT NULL THEN
    SELECT COALESCE(restrict_to_networks,false), COALESCE(allowed_coach_ids,'{}'::uuid[]), coach_id
      INTO v_restrict, v_allowed, v_owner_coach
      FROM public.professional_products WHERE id = NEW.professional_product_id;
  END IF;

  IF NOT COALESCE(v_restrict, false) THEN
    RETURN NEW;
  END IF;

  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  SELECT s.profile_id INTO v_profile FROM public.students s WHERE s.id = NEW.student_id;
  v_chain := public.cadeia_coaches_do_perfil(v_profile);

  IF v_chain && v_allowed THEN
    RETURN NEW;
  END IF;

  IF v_owner_coach IS NOT NULL AND v_owner_coach = ANY (v_chain) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Este produto está disponível apenas para alunos da rede autorizada.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.backfill_career_points()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  v_is_admin := public.is_admin(auth.uid());
  IF NOT COALESCE(v_is_admin, FALSE) THEN
    RAISE EXCEPTION 'Apenas administradores podem executar o backfill.';
  END IF;

  DELETE FROM public.coach_points_log;
  DELETE FROM public.monthly_rankings;
  DELETE FROM public.career_plan_progress;
  DELETE FROM public.career_challenge_progress;
  UPDATE public.coaches SET total_points = 0;

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

  RETURN jsonb_build_object('ok', TRUE, 'processed', v_processed, 'skipped', v_skipped, 'ran_at', NOW());
END;
$function$;