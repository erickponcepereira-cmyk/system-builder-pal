
-- =========================================================
-- 1) Master Coach automático para profissionais
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_master_coach(_coach_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coaches c
    WHERE c.id = _coach_id
      AND c.is_professional = true
      AND c.approved_at IS NOT NULL
  )
  OR EXISTS (
    SELECT 1 FROM public.coach_badges
    WHERE coach_id = _coach_id
      AND badge_key = 'master_coach'::public.coach_badge_key
  );
$$;

-- =========================================================
-- 2) Bônus master coach em pedidos cross-network
-- =========================================================
ALTER TABLE public.partner_product_orders
  ADD COLUMN IF NOT EXISTS master_coach_cross_bonus_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS master_coach_cross_beneficiary_coach_id uuid REFERENCES public.coaches(id);

-- =========================================================
-- 3) Produtos agendáveis
-- =========================================================
ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS is_schedulable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_duration_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS cancellation_window_hours integer NOT NULL DEFAULT 24;

-- =========================================================
-- 4) Disponibilidade semanal do profissional
-- =========================================================
CREATE TABLE IF NOT EXISTS public.professional_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  slot_minutes integer NOT NULL DEFAULT 30 CHECK (slot_minutes BETWEEN 5 AND 240),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prof_avail_coach ON public.professional_availability(professional_coach_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_availability TO authenticated;
GRANT ALL ON public.professional_availability TO service_role;

ALTER TABLE public.professional_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY prof_avail_read ON public.professional_availability
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY prof_avail_owner_write ON public.professional_availability
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = professional_coach_id AND p.user_id = auth.uid()
  ));

CREATE POLICY prof_avail_owner_update ON public.professional_availability
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = professional_coach_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = professional_coach_id AND p.user_id = auth.uid()
  ));

CREATE POLICY prof_avail_owner_delete ON public.professional_availability
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = professional_coach_id AND p.user_id = auth.uid()
  ));

CREATE POLICY prof_avail_admin_all ON public.professional_availability
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_prof_avail_updated
  BEFORE UPDATE ON public.professional_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 5) Consultas agendadas
-- =========================================================
CREATE TABLE IF NOT EXISTS public.professional_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.professional_products(id) ON DELETE RESTRICT,
  seller_coach_id uuid REFERENCES public.coaches(id),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.partner_product_orders(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','cancelled','completed','no_show')),
  cancellation_window_hours integer NOT NULL DEFAULT 24,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_appt_prof_time ON public.professional_appointments(professional_coach_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appt_student_time ON public.professional_appointments(student_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appt_seller ON public.professional_appointments(seller_coach_id);
-- Evita dois agendamentos do mesmo profissional começando exatamente no mesmo instante
CREATE UNIQUE INDEX IF NOT EXISTS uniq_appt_prof_starts_active
  ON public.professional_appointments(professional_coach_id, starts_at)
  WHERE status = 'scheduled';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_appointments TO authenticated;
GRANT ALL ON public.professional_appointments TO service_role;

ALTER TABLE public.professional_appointments ENABLE ROW LEVEL SECURITY;

-- Quem pode ler: dono profissional, vendedor, aluno e admin
CREATE POLICY appt_read ON public.professional_appointments
  FOR SELECT TO authenticated
  USING (
    is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
      WHERE c.id = professional_appointments.professional_coach_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
      WHERE c.id = professional_appointments.seller_coach_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
      WHERE s.id = professional_appointments.student_id AND p.user_id = auth.uid()
    )
  );

-- Inserção: apenas via RPC security definer; nenhum policy permite INSERT direto
-- (admin pode tudo)
CREATE POLICY appt_admin_all ON public.professional_appointments
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Atualização limitada (cancelar/anotar) por dono, vendedor ou aluno (status só vai p/ cancelled)
CREATE POLICY appt_update_cancel ON public.professional_appointments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
      WHERE c.id = professional_appointments.professional_coach_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
      WHERE c.id = professional_appointments.seller_coach_id AND p.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
      WHERE s.id = professional_appointments.student_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (true);

CREATE TRIGGER trg_appt_updated
  BEFORE UPDATE ON public.professional_appointments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger: bloqueia cancelamento fora da janela
CREATE OR REPLACE FUNCTION public.enforce_appointment_cancellation_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status = 'scheduled' THEN
    IF now() > (OLD.starts_at - make_interval(hours => OLD.cancellation_window_hours)) THEN
      -- admin pode ignorar a janela
      IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Cancelamento fora da janela permitida (%h antes do horário)', OLD.cancellation_window_hours;
      END IF;
    END IF;
    NEW.cancelled_at := now();
    NEW.cancelled_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_appt_cancel_window
  BEFORE UPDATE ON public.professional_appointments
  FOR EACH ROW EXECUTE FUNCTION public.enforce_appointment_cancellation_window();

ALTER PUBLICATION supabase_realtime ADD TABLE public.professional_appointments;

-- =========================================================
-- 6) RPC para listar slots disponíveis
-- =========================================================
CREATE OR REPLACE FUNCTION public.list_professional_available_slots(
  _coach_id uuid,
  _from timestamptz,
  _to timestamptz,
  _duration_minutes integer DEFAULT 30
)
RETURNS TABLE(slot_start timestamptz, slot_end timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day date;
  v_avail RECORD;
  v_slot_start timestamptz;
  v_slot_end timestamptz;
BEGIN
  IF _duration_minutes IS NULL OR _duration_minutes < 5 THEN _duration_minutes := 30; END IF;
  FOR v_day IN SELECT generate_series(_from::date, _to::date, interval '1 day')::date LOOP
    FOR v_avail IN
      SELECT * FROM public.professional_availability
      WHERE professional_coach_id = _coach_id
        AND is_active = true
        AND weekday = EXTRACT(DOW FROM v_day)::int
    LOOP
      v_slot_start := (v_day + v_avail.start_time)::timestamptz;
      LOOP
        v_slot_end := v_slot_start + make_interval(mins => _duration_minutes);
        EXIT WHEN v_slot_end::time > v_avail.end_time;
        EXIT WHEN v_slot_start < now();
        IF NOT EXISTS (
          SELECT 1 FROM public.professional_appointments a
          WHERE a.professional_coach_id = _coach_id
            AND a.status = 'scheduled'
            AND a.starts_at < v_slot_end
            AND a.ends_at   > v_slot_start
        ) THEN
          slot_start := v_slot_start;
          slot_end := v_slot_end;
          RETURN NEXT;
        END IF;
        v_slot_start := v_slot_start + make_interval(mins => v_avail.slot_minutes);
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_professional_available_slots(uuid, timestamptz, timestamptz, integer) TO authenticated;

-- =========================================================
-- 7) RPC: criar pedido agendado de produto profissional
--    (variação da create_partner_product_order que reserva slot + grava bônus master coach)
-- =========================================================
CREATE OR REPLACE FUNCTION public.create_scheduled_professional_order(
  _professional_product_id uuid,
  _starts_at timestamptz,
  _payment_method text DEFAULT 'pix',
  _student_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_student_coach_id UUID;
  v_upline1 UUID; v_upline2 UUID; v_upline3 UUID;
  v_prod RECORD;
  v_gross NUMERIC; v_fee NUMERIC; v_tax NUMERIC; v_sys NUMERIC := 20;
  v_fee_pct NUMERIC;
  v_coach_pct NUMERIC; v_coach_amt NUMERIC;
  v_l1 NUMERIC; v_l2 NUMERIC; v_l3 NUMERIC;
  v_coach_net NUMERIC; v_partner_net NUMERIC;
  v_order_id UUID;
  v_caller_coach_id UUID;
  v_ends_at timestamptz;
  v_cross_bonus NUMERIC := 0;
  v_cross_beneficiary UUID := NULL;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  SELECT * INTO v_prod FROM public.professional_products WHERE id = _professional_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_professional <> true THEN
    RAISE EXCEPTION 'Produto indisponível';
  END IF;
  IF v_prod.is_schedulable <> true THEN
    RAISE EXCEPTION 'Produto não é agendável';
  END IF;

  -- Quem chama? Pode ser o aluno (autocompra) ou outro coach (venda agendada)
  SELECT c.id INTO v_caller_coach_id
  FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF _student_id IS NOT NULL THEN
    -- Coach vendendo para um aluno específico
    IF v_caller_coach_id IS NULL THEN
      RAISE EXCEPTION 'Apenas coaches podem agendar para alunos';
    END IF;
    SELECT id, coach_id INTO v_student_id, v_student_coach_id
    FROM public.students WHERE id = _student_id LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
  ELSE
    -- Aluno autocomprando
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
    FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
  END IF;

  -- Validar slot ainda disponível
  v_ends_at := _starts_at + make_interval(mins => COALESCE(v_prod.default_duration_minutes, 30));
  IF EXISTS (
    SELECT 1 FROM public.professional_appointments
    WHERE professional_coach_id = v_prod.coach_id
      AND status = 'scheduled'
      AND starts_at < v_ends_at
      AND ends_at   > _starts_at
  ) THEN
    RAISE EXCEPTION 'Horário não está mais disponível';
  END IF;
  IF _starts_at < now() THEN
    RAISE EXCEPTION 'Não é possível agendar no passado';
  END IF;

  -- Uplines do coach do aluno
  IF v_student_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_student_coach_id;
    IF v_upline1 IS NOT NULL THEN
      SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1;
      IF v_upline2 IS NOT NULL THEN
        SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2;
      END IF;
    END IF;
  END IF;

  v_gross := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END;
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_tax := ROUND(v_gross * 6 / 100, 2);
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_coach_amt := ROUND(v_gross * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_gross * 3 / 100, 2);
  v_l2 := ROUND(v_gross * 2 / 100, 2);
  v_l3 := ROUND(v_gross * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := ROUND(v_gross - v_fee - v_tax - v_sys - v_coach_amt, 2);

  -- Bônus master coach cross: vendedor é profissional, vendendo produto de OUTRO profissional,
  -- e o aluno NÃO está diretamente vinculado ao vendedor (downline L1)
  IF v_caller_coach_id IS NOT NULL
     AND v_caller_coach_id <> v_prod.coach_id
     AND is_master_coach(v_caller_coach_id)
     AND COALESCE(v_student_coach_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_caller_coach_id
  THEN
    v_cross_bonus := ROUND(v_gross * 10 / 100, 2);
    v_cross_beneficiary := v_caller_coach_id;
    v_partner_net := ROUND(v_partner_net - v_cross_bonus, 2);
  END IF;

  INSERT INTO public.partner_product_orders (
    student_id, professional_product_id, professional_coach_id, selling_coach_id,
    upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id,
    payment_method, status, gross_amount, payment_fee, tax_amount, system_fee,
    coach_commission_pct, coach_commission_amount,
    network_l1_amount, network_l2_amount, network_l3_amount,
    coach_net_amount, partner_net_amount,
    master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id
  ) VALUES (
    v_student_id, v_prod.id, v_prod.coach_id, COALESCE(v_caller_coach_id, v_student_coach_id),
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net,
    v_cross_bonus, v_cross_beneficiary
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.professional_appointments (
    professional_coach_id, product_id, seller_coach_id, student_id, order_id,
    starts_at, ends_at, cancellation_window_hours
  ) VALUES (
    v_prod.coach_id, v_prod.id, v_caller_coach_id, v_student_id, v_order_id,
    _starts_at, v_ends_at, COALESCE(v_prod.cancellation_window_hours, 24)
  );

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_scheduled_professional_order(uuid, timestamptz, text, uuid) TO authenticated;
