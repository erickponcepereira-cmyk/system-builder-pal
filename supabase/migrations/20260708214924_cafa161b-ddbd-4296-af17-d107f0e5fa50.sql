CREATE OR REPLACE FUNCTION public.reserve_partner_freebie(_product_id uuid, _slot_start timestamp with time zone)
 RETURNS TABLE(reservation_id uuid, qr_token text, slot_end timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_student_id uuid;
  v_fallback_coach uuid;
  v_ref_code text;
  v_product public.partner_products%ROWTYPE;
  v_schedule public.partner_product_schedules%ROWTYPE;
  v_slot_end timestamptz;
  v_capacity int;
  v_taken int;
  v_weekday smallint;
  v_iso_week text;
  v_local_start timestamp;
  v_used_this_week int;
  v_new_id uuid;
  v_token text;
  br_tz constant text := 'America/Sao_Paulo';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;

  SELECT id INTO v_student_id FROM public.students WHERE profile_id = v_uid LIMIT 1;
  IF v_student_id IS NULL THEN
    -- Try existing fallback coach id, then any admin coach, then any approved coach
    SELECT id INTO v_fallback_coach FROM public.coaches
     WHERE id = 'f9a44c8a-31ea-4ca1-8cef-b9049733c5e1'::uuid LIMIT 1;
    IF v_fallback_coach IS NULL THEN
      SELECT c.id INTO v_fallback_coach FROM public.coaches c
        JOIN public.profiles p ON p.id = c.profile_id
       WHERE c.approved_at IS NOT NULL AND c.blocked_at IS NULL AND p.role = 'admin'
       LIMIT 1;
    END IF;
    IF v_fallback_coach IS NULL THEN
      SELECT id INTO v_fallback_coach FROM public.coaches
       WHERE approved_at IS NOT NULL AND blocked_at IS NULL LIMIT 1;
    END IF;
    IF v_fallback_coach IS NULL THEN
      RAISE EXCEPTION 'Não há coach ativo para vincular o perfil de aluno automaticamente.';
    END IF;

    v_ref_code := 'FC' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
    INSERT INTO public.students(profile_id, coach_id, referral_code, referral_link)
    VALUES (v_uid, v_fallback_coach, v_ref_code, '/i/' || v_ref_code)
    RETURNING id INTO v_student_id;
  END IF;

  SELECT * INTO v_product FROM public.partner_products WHERE id = _product_id;
  IF NOT FOUND OR v_product.status <> 'approved' OR NOT v_product.is_active_by_partner OR v_product.kind <> 'free' THEN
    RAISE EXCEPTION 'Produto indisponível';
  END IF;

  v_local_start := (_slot_start AT TIME ZONE br_tz);
  v_weekday := EXTRACT(DOW FROM v_local_start)::smallint;

  SELECT * INTO v_schedule FROM public.partner_product_schedules
   WHERE partner_product_id = _product_id
     AND active
     AND weekday = v_weekday
     AND start_time = v_local_start::time
   LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Horário inválido para este produto'; END IF;

  v_slot_end := ((v_local_start::date::text || ' ' || v_schedule.end_time::text)::timestamp AT TIME ZONE br_tz);
  IF v_slot_end <= now() THEN RAISE EXCEPTION 'Este horário já passou'; END IF;
  v_capacity := v_schedule.capacity;

  v_iso_week := to_char(v_local_start, 'IYYY') || '-W' || to_char(v_local_start, 'IW');

  PERFORM 1 FROM public.partner_freebie_reservations
   WHERE partner_product_id = _product_id AND slot_start = _slot_start
   FOR UPDATE;

  SELECT COUNT(*) INTO v_taken FROM public.partner_freebie_reservations
   WHERE partner_product_id = _product_id AND slot_start = _slot_start
     AND status IN ('reserved','used');
  IF v_taken >= v_capacity THEN RAISE EXCEPTION 'Sem vagas neste horário'; END IF;

  SELECT COUNT(*) INTO v_used_this_week FROM public.partner_freebie_reservations
   WHERE partner_product_id = _product_id
     AND student_id = v_student_id
     AND iso_week = v_iso_week
     AND status IN ('reserved','used');
  IF v_used_this_week >= COALESCE(v_product.weekly_limit_per_student, 1) THEN
    RAISE EXCEPTION 'Você já usou seu limite semanal para este produto';
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.partner_freebie_reservations(
    partner_product_id, partner_id, student_id, profile_id,
    slot_start, slot_end, weekday, iso_week, qr_token
  )
  VALUES (
    _product_id, v_product.partner_id, v_student_id, v_uid,
    _slot_start, v_slot_end, v_weekday, v_iso_week, v_token
  )
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id, v_token, v_slot_end;
END;
$function$;