DROP TRIGGER IF EXISTS on_profile_created_ensure_student ON public.profiles;

CREATE OR REPLACE FUNCTION public.ensure_student_for_profile(
  _profile_id uuid,
  _preferred_coach_id uuid DEFAULT NULL::uuid,
  _partner_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid;
  v_current_coach_id uuid;
  v_assignment_pending boolean;
  v_coach_profile_id uuid;
  v_code text;
  v_attempt integer := 0;
BEGIN
  IF _profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado.';
  END IF;
  IF _preferred_coach_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um coach responsável para concluir o cadastro.';
  END IF;

  SELECT c.profile_id
    INTO v_coach_profile_id
  FROM public.coaches c
  WHERE c.id = _preferred_coach_id
    AND c.approved_at IS NOT NULL
    AND c.blocked_at IS NULL
  LIMIT 1;

  IF v_coach_profile_id IS NULL THEN
    RAISE EXCEPTION 'O coach selecionado não está ativo.';
  END IF;
  IF v_coach_profile_id = _profile_id THEN
    RAISE EXCEPTION 'Você não pode selecionar a si próprio como coach responsável.';
  END IF;

  SELECT id, coach_id, coach_assignment_pending
    INTO v_student_id, v_current_coach_id, v_assignment_pending
  FROM public.students
  WHERE profile_id = _profile_id
  LIMIT 1;

  IF v_student_id IS NOT NULL THEN
    IF COALESCE(v_assignment_pending, false) OR v_current_coach_id IS NULL THEN
      UPDATE public.students
      SET coach_id = _preferred_coach_id,
          coach_assignment_pending = false,
          partner_id = COALESCE(_partner_id, partner_id),
          updated_at = now()
      WHERE id = v_student_id;
    ELSIF v_current_coach_id <> _preferred_coach_id THEN
      RAISE EXCEPTION 'O coach responsável desta conta já foi confirmado e não pode ser alterado.';
    ELSIF _partner_id IS NOT NULL THEN
      UPDATE public.students
      SET partner_id = COALESCE(partner_id, _partner_id),
          updated_at = now()
      WHERE id = v_student_id;
    END IF;
    RETURN v_student_id;
  END IF;

  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'FC' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    BEGIN
      INSERT INTO public.students (
        profile_id, coach_id, referral_code, referral_link, partner_id,
        coach_assignment_pending, created_at, updated_at
      ) VALUES (
        _profile_id, _preferred_coach_id, v_code, '/i/' || v_code, _partner_id,
        false, now(), now()
      )
      RETURNING id INTO v_student_id;
      RETURN v_student_id;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 8 THEN RAISE; END IF;
    END;
  END LOOP;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_student_for_profile(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_student_for_profile(uuid, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_student_row_for_profile(
  _profile_id uuid,
  _coach_id uuid DEFAULT NULL::uuid,
  _pending boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(_pending, false) THEN
    RAISE EXCEPTION 'Não é permitido criar aluno sem coach confirmado.';
  END IF;
  RETURN public.ensure_student_for_profile(_profile_id, _coach_id, NULL);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.ensure_student_row_for_profile(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_student_row_for_profile(uuid, uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.ensure_self_student_for_coach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.upline_coach_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um coach responsável antes de criar o perfil de coach.';
  END IF;
  PERFORM public.ensure_student_for_profile(NEW.profile_id, NEW.upline_coach_id, NULL);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.guard_confirmed_student_coach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_profile_id uuid;
BEGIN
  IF TG_OP = 'INSERT' AND COALESCE(NEW.coach_assignment_pending, false) THEN
    RAISE EXCEPTION 'Não é permitido criar aluno sem coach confirmado.';
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.coach_id IS NOT DISTINCT FROM OLD.coach_id
     AND NEW.coach_assignment_pending IS NOT DISTINCT FROM OLD.coach_assignment_pending THEN
    RETURN NEW;
  END IF;

  SELECT c.profile_id INTO v_coach_profile_id
  FROM public.coaches c
  WHERE c.id = NEW.coach_id
    AND c.approved_at IS NOT NULL
    AND c.blocked_at IS NULL;

  IF v_coach_profile_id IS NULL THEN
    RAISE EXCEPTION 'O aluno precisa estar vinculado a um coach ativo.';
  END IF;
  IF v_coach_profile_id = NEW.profile_id THEN
    RAISE EXCEPTION 'O aluno não pode ser o próprio coach responsável.';
  END IF;
  IF COALESCE(NEW.coach_assignment_pending, false) THEN
    RAISE EXCEPTION 'O novo vínculo de coach precisa ser confirmado.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_guard_confirmed_student_coach ON public.students;
CREATE TRIGGER trg_guard_confirmed_student_coach
BEFORE INSERT OR UPDATE OF coach_id, coach_assignment_pending ON public.students
FOR EACH ROW EXECUTE FUNCTION public.guard_confirmed_student_coach();

REVOKE EXECUTE ON FUNCTION public.guard_confirmed_student_coach() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_confirmed_student_coach() TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_partner_freebie(_product_id uuid, _slot_start timestamp with time zone)
RETURNS TABLE(reservation_id uuid, qr_token text, slot_end timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_student_id uuid;
  v_product public.partner_products%ROWTYPE;
  v_schedule public.partner_product_schedules%ROWTYPE;
  v_slot_end timestamptz;
  v_capacity int;
  v_taken int;
  v_weekday smallint;
  v_iso_week text;
  v_local_start timestamp;
  v_used_this_week int;
  v_existing_id uuid;
  v_existing_token text;
  v_existing_end timestamptz;
  v_new_id uuid;
  v_token text;
  br_tz constant text := 'America/Cuiaba';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;

  SELECT id INTO v_student_id
  FROM public.students
  WHERE profile_id = v_profile_id AND coach_assignment_pending = false
  LIMIT 1;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Conclua seu cadastro e confirme seu coach antes de reservar.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_product FROM public.partner_products WHERE id = _product_id;
  IF NOT FOUND OR v_product.status <> 'approved' OR NOT v_product.is_active_by_partner OR v_product.kind <> 'free' THEN
    RAISE EXCEPTION 'Produto indisponível';
  END IF;

  v_local_start := (_slot_start AT TIME ZONE br_tz);
  v_weekday := EXTRACT(DOW FROM v_local_start)::smallint;
  SELECT * INTO v_schedule FROM public.partner_product_schedules
   WHERE partner_product_id = _product_id AND active AND weekday = v_weekday
     AND start_time = v_local_start::time LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Horário inválido para este produto'; END IF;

  v_slot_end := ((v_local_start::date::text || ' ' || v_schedule.end_time::text)::timestamp AT TIME ZONE br_tz);
  IF v_slot_end <= now() THEN RAISE EXCEPTION 'Este horário já passou'; END IF;
  v_capacity := v_schedule.capacity;

  SELECT r.id, r.qr_token, r.slot_end INTO v_existing_id, v_existing_token, v_existing_end
  FROM public.partner_freebie_reservations r
  WHERE r.partner_product_id = _product_id AND r.student_id = v_student_id
    AND r.slot_start = _slot_start AND r.status IN ('reserved','used')
  ORDER BY r.created_at DESC LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    reservation_id := v_existing_id; qr_token := v_existing_token; slot_end := v_existing_end;
    RETURN NEXT; RETURN;
  END IF;

  v_iso_week := to_char(v_local_start, 'IYYY') || '-W' || to_char(v_local_start, 'IW');
  PERFORM 1 FROM public.partner_freebie_reservations r
   WHERE r.partner_product_id = _product_id AND r.slot_start = _slot_start FOR UPDATE;
  SELECT COUNT(*) INTO v_taken FROM public.partner_freebie_reservations r
   WHERE r.partner_product_id = _product_id AND r.slot_start = _slot_start
     AND r.status IN ('reserved','used');
  IF v_taken >= v_capacity THEN RAISE EXCEPTION 'Sem vagas neste horário'; END IF;

  SELECT COUNT(*) INTO v_used_this_week FROM public.partner_freebie_reservations r
   WHERE r.partner_product_id = _product_id AND r.student_id = v_student_id
     AND r.iso_week = v_iso_week AND r.status IN ('reserved','used');
  IF v_used_this_week >= COALESCE(v_product.weekly_limit_per_student, 1) THEN
    RAISE EXCEPTION 'Você já usou seu limite semanal para este produto';
  END IF;

  v_token := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO public.partner_freebie_reservations(
    partner_product_id, partner_id, student_id, profile_id,
    slot_start, slot_end, weekday, iso_week, qr_token
  ) VALUES (
    _product_id, v_product.partner_id, v_student_id, v_profile_id,
    _slot_start, v_slot_end, v_weekday, v_iso_week, v_token
  ) RETURNING id INTO v_new_id;

  reservation_id := v_new_id; qr_token := v_token; slot_end := v_slot_end;
  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reserve_partner_freebie(uuid, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_partner_freebie(uuid, timestamptz) TO authenticated, service_role;