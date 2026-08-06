-- 1) Helper: nunca deixar o comprador ser o próprio coach vendedor
CREATE OR REPLACE FUNCTION public.resolve_selling_coach(_student_id uuid, _coach_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_profile uuid;
  v_coach_profile uuid;
  v_upline uuid;
BEGIN
  IF _coach_id IS NULL OR _student_id IS NULL THEN
    RETURN _coach_id;
  END IF;
  SELECT s.profile_id INTO v_student_profile FROM public.students s WHERE s.id = _student_id;
  SELECT c.profile_id, c.upline_coach_id INTO v_coach_profile, v_upline FROM public.coaches c WHERE c.id = _coach_id;
  IF v_student_profile IS NOT NULL AND v_student_profile = v_coach_profile THEN
    RETURN COALESCE(v_upline, _coach_id);
  END IF;
  RETURN _coach_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_selling_coach(uuid, uuid) TO authenticated, service_role;

-- 2) Aplicar o helper nas funções de criação de pedido (patch cirúrgico do corpo atual)
DO $mig$
DECLARE
  sig text;
  f text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.create_partner_company_order(uuid,uuid,text,uuid)',
    'public.create_partner_product_order(uuid,text,uuid,uuid)',
    'public.create_scheduled_professional_order(uuid,timestamp with time zone,text,uuid,uuid)'
  ] LOOP
    f := pg_get_functiondef(sig::regprocedure);
    f := replace(
      f,
      'v_selling_coach_id := COALESCE(v_caller_coach_id, v_student_coach_id);',
      'v_selling_coach_id := public.resolve_selling_coach(v_student_id, COALESCE(v_caller_coach_id, v_student_coach_id));'
    );
    f := replace(
      f,
      'v_selling_coach_id := v_student_coach_id;',
      'v_selling_coach_id := public.resolve_selling_coach(v_student_id, v_student_coach_id);'
    );
    EXECUTE f;
  END LOOP;
END
$mig$;

-- 3) Aluno nunca vinculado a si mesmo como coach
CREATE OR REPLACE FUNCTION public.prevent_student_self_coach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_coach_profile uuid;
  v_upline uuid;
BEGIN
  IF NEW.coach_id IS NULL THEN RETURN NEW; END IF;
  SELECT c.profile_id, c.upline_coach_id INTO v_coach_profile, v_upline
    FROM public.coaches c WHERE c.id = NEW.coach_id;
  IF v_coach_profile IS NOT NULL AND v_coach_profile = NEW.profile_id THEN
    NEW.coach_id := v_upline;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_student_self_coach ON public.students;
CREATE TRIGGER trg_prevent_student_self_coach
BEFORE INSERT OR UPDATE OF coach_id ON public.students
FOR EACH ROW EXECUTE FUNCTION public.prevent_student_self_coach();

-- 4) Expirar pedidos pendentes com mais de 30 minutos (parceiro e profissional)
CREATE OR REPLACE FUNCTION public.expire_unpaid_product_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT o.id AS order_id
      FROM public.partner_product_orders o
     WHERE o.status = 'pending'
       AND o.created_at < now() - interval '30 minutes'
       AND o.paid_at IS NULL
       AND COALESCE(o.payment_status, '') NOT IN ('in_process','authorized','pending_capture')
  LOOP
    UPDATE public.professional_appointments
       SET status = 'cancelled'
     WHERE order_id = r.order_id AND status = 'scheduled';

    UPDATE public.partner_product_orders
       SET status = 'cancelled'
     WHERE id = r.order_id AND status = 'pending';

    INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
    VALUES (r.order_id, 'pending', 'cancelled', NULL, 'Cancelado automaticamente: pagamento não confirmado em 30 minutos');

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

SELECT cron.unschedule('expire-unpaid-professional-appointments')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-unpaid-professional-appointments');

SELECT cron.schedule(
  'expire-unpaid-product-orders',
  '*/5 * * * *',
  $$select public.expire_unpaid_product_orders();$$
);