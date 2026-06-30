
-- Partner free-product scheduling: weekly availability windows, capacity per slot,
-- per-student weekly limit, reservation with QR token, and redemption.

ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS weekly_limit_per_student integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS uses_scheduling boolean NOT NULL DEFAULT false;

-- ============================================================================
-- Schedules: recurring weekly windows per product
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.partner_product_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_product_id uuid NOT NULL REFERENCES public.partner_products(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
CREATE INDEX IF NOT EXISTS idx_pps_product ON public.partner_product_schedules(partner_product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_product_schedules TO authenticated;
GRANT ALL ON public.partner_product_schedules TO service_role;
ALTER TABLE public.partner_product_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "schedules read all auth"
  ON public.partner_product_schedules FOR SELECT TO authenticated USING (true);

CREATE POLICY "schedules manage owner"
  ON public.partner_product_schedules FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.partner_products pp
    JOIN public.partners p ON p.id = pp.partner_id
    WHERE pp.id = partner_product_schedules.partner_product_id
      AND (p.profile_id = auth.uid() OR public.is_admin(auth.uid()))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.partner_products pp
    JOIN public.partners p ON p.id = pp.partner_id
    WHERE pp.id = partner_product_schedules.partner_product_id
      AND (p.profile_id = auth.uid() OR public.is_admin(auth.uid()))
  ));

-- ============================================================================
-- Reservations
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE public.partner_freebie_reservation_status AS ENUM ('reserved','used','cancelled','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.partner_freebie_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_product_id uuid NOT NULL REFERENCES public.partner_products(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slot_start timestamptz NOT NULL,
  slot_end timestamptz NOT NULL,
  weekday smallint NOT NULL,
  iso_week text NOT NULL, -- e.g. '2026-W27' (BR tz)
  status public.partner_freebie_reservation_status NOT NULL DEFAULT 'reserved',
  qr_token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
  used_at timestamptz,
  scanned_by_profile_id uuid REFERENCES public.profiles(id),
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pfr_product_slot ON public.partner_freebie_reservations(partner_product_id, slot_start);
CREATE INDEX IF NOT EXISTS idx_pfr_student_week ON public.partner_freebie_reservations(student_id, iso_week);
CREATE INDEX IF NOT EXISTS idx_pfr_partner_status ON public.partner_freebie_reservations(partner_id, status, slot_start);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_freebie_reservations TO authenticated;
GRANT ALL ON public.partner_freebie_reservations TO service_role;
ALTER TABLE public.partner_freebie_reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pfr select own student"
  ON public.partner_freebie_reservations FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "pfr select partner owner"
  ON public.partner_freebie_reservations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.partners p
    WHERE p.id = partner_freebie_reservations.partner_id
      AND (p.profile_id = auth.uid() OR public.is_admin(auth.uid()))
  ));

-- Mutations go through SECURITY DEFINER RPCs only. No direct INSERT/UPDATE policies.

-- ============================================================================
-- RPC: list available slots in a date range
-- ============================================================================
CREATE OR REPLACE FUNCTION public.list_partner_freebie_slots(
  _product_id uuid,
  _from timestamptz,
  _to timestamptz
)
RETURNS TABLE(slot_start timestamptz, slot_end timestamptz, capacity int, taken int, remaining int)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  br_tz constant text := 'America/Sao_Paulo';
BEGIN
  RETURN QUERY
  WITH days AS (
    SELECT (d::date) AS day
    FROM generate_series(
      (_from AT TIME ZONE br_tz)::date,
      (_to   AT TIME ZONE br_tz)::date,
      interval '1 day'
    ) d
  ),
  slots AS (
    SELECT
      ((d.day::text || ' ' || s.start_time::text)::timestamp AT TIME ZONE br_tz) AS s_start,
      ((d.day::text || ' ' || s.end_time::text)::timestamp   AT TIME ZONE br_tz) AS s_end,
      s.capacity
    FROM days d
    JOIN public.partner_product_schedules s
      ON s.partner_product_id = _product_id
     AND s.active
     AND s.weekday = EXTRACT(DOW FROM d.day)::smallint
  )
  SELECT
    sl.s_start,
    sl.s_end,
    sl.capacity,
    COALESCE(COUNT(r.id) FILTER (WHERE r.status IN ('reserved','used')), 0)::int AS taken,
    GREATEST(sl.capacity - COALESCE(COUNT(r.id) FILTER (WHERE r.status IN ('reserved','used')), 0), 0)::int AS remaining
  FROM slots sl
  LEFT JOIN public.partner_freebie_reservations r
    ON r.partner_product_id = _product_id
   AND r.slot_start = sl.s_start
  WHERE sl.s_end > now()
    AND sl.s_start >= _from
    AND sl.s_start <  _to
  GROUP BY sl.s_start, sl.s_end, sl.capacity
  ORDER BY sl.s_start;
END $$;
GRANT EXECUTE ON FUNCTION public.list_partner_freebie_slots(uuid, timestamptz, timestamptz) TO authenticated;

-- ============================================================================
-- RPC: reserve a slot
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reserve_partner_freebie(
  _product_id uuid,
  _slot_start timestamptz
)
RETURNS TABLE(reservation_id uuid, qr_token text, slot_end timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
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
  v_new_id uuid;
  v_token text;
  br_tz constant text := 'America/Sao_Paulo';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501'; END IF;

  SELECT id INTO v_student_id FROM public.students WHERE profile_id = v_uid LIMIT 1;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'Perfil de aluno não encontrado'; END IF;

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

  -- ISO week in BR tz, e.g. 2026-W27
  v_iso_week := to_char(v_local_start, 'IYYY') || '-W' || to_char(v_local_start, 'IW');

  -- Lock capacity check
  PERFORM 1 FROM public.partner_freebie_reservations
   WHERE partner_product_id = _product_id AND slot_start = _slot_start
   FOR UPDATE;

  SELECT COUNT(*) INTO v_taken FROM public.partner_freebie_reservations
   WHERE partner_product_id = _product_id AND slot_start = _slot_start
     AND status IN ('reserved','used');
  IF v_taken >= v_capacity THEN RAISE EXCEPTION 'Sem vagas neste horário'; END IF;

  -- Weekly limit per student (calendar week, BR tz)
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
END $$;
GRANT EXECUTE ON FUNCTION public.reserve_partner_freebie(uuid, timestamptz) TO authenticated;

-- ============================================================================
-- RPC: cancel reservation (student)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_partner_freebie(_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.partner_freebie_reservations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.partner_freebie_reservations WHERE id = _reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reserva não encontrada'; END IF;
  IF r.profile_id <> auth.uid() THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF r.status <> 'reserved' THEN RAISE EXCEPTION 'Reserva não pode ser cancelada'; END IF;
  IF r.slot_start <= now() THEN RAISE EXCEPTION 'Não é possível cancelar após o início do horário'; END IF;
  UPDATE public.partner_freebie_reservations
     SET status = 'cancelled', cancelled_at = now()
   WHERE id = _reservation_id;
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_partner_freebie(uuid) TO authenticated;

-- ============================================================================
-- RPC: redeem QR (partner scanning)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.redeem_partner_freebie(_qr_token text)
RETURNS TABLE(reservation_id uuid, student_name text, product_name text, slot_start timestamptz, slot_end timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  r public.partner_freebie_reservations%ROWTYPE;
  v_is_owner boolean;
  v_student_name text;
  v_product_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT * INTO r FROM public.partner_freebie_reservations WHERE qr_token = _qr_token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'QR inválido'; END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.partners p
     WHERE p.id = r.partner_id AND (p.profile_id = v_uid OR public.is_admin(v_uid))
  ) INTO v_is_owner;
  IF NOT v_is_owner THEN RAISE EXCEPTION 'Este QR não pertence ao seu estabelecimento'; END IF;

  IF r.status = 'used' THEN RAISE EXCEPTION 'QR já utilizado'; END IF;
  IF r.status <> 'reserved' THEN RAISE EXCEPTION 'Reserva % não pode ser usada', r.status; END IF;
  IF now() < r.slot_start - interval '15 minutes' THEN RAISE EXCEPTION 'Muito cedo: o horário começa em %', to_char(r.slot_start AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'); END IF;
  IF now() > r.slot_end THEN
    UPDATE public.partner_freebie_reservations SET status='expired' WHERE id = r.id;
    RAISE EXCEPTION 'QR expirado';
  END IF;

  UPDATE public.partner_freebie_reservations
     SET status='used', used_at = now(), scanned_by_profile_id = v_uid
   WHERE id = r.id;

  SELECT pr.name INTO v_student_name FROM public.profiles pr WHERE pr.id = r.profile_id;
  SELECT pp.name INTO v_product_name FROM public.partner_products pp WHERE pp.id = r.partner_product_id;

  RETURN QUERY SELECT r.id, v_student_name, v_product_name, r.slot_start, r.slot_end;
END $$;
GRANT EXECUTE ON FUNCTION public.redeem_partner_freebie(text) TO authenticated;

-- ============================================================================
-- RPC: replace all schedules for a product (partner UI save)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_partner_product_schedules(
  _product_id uuid,
  _schedules jsonb  -- [{weekday, start_time, end_time, capacity}, ...]
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner_profile uuid;
  rec jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT p.profile_id INTO v_partner_profile
    FROM public.partner_products pp JOIN public.partners p ON p.id = pp.partner_id
   WHERE pp.id = _product_id;
  IF v_partner_profile IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;
  IF v_partner_profile <> v_uid AND NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  DELETE FROM public.partner_product_schedules WHERE partner_product_id = _product_id;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_schedules,'[]'::jsonb)) LOOP
    INSERT INTO public.partner_product_schedules(
      partner_product_id, weekday, start_time, end_time, capacity, active
    ) VALUES (
      _product_id,
      (rec->>'weekday')::smallint,
      (rec->>'start_time')::time,
      (rec->>'end_time')::time,
      COALESCE((rec->>'capacity')::int, 1),
      true
    );
  END LOOP;
  UPDATE public.partner_products SET uses_scheduling = (jsonb_array_length(COALESCE(_schedules,'[]'::jsonb)) > 0)
   WHERE id = _product_id;
END $$;
GRANT EXECUTE ON FUNCTION public.set_partner_product_schedules(uuid, jsonb) TO authenticated;
