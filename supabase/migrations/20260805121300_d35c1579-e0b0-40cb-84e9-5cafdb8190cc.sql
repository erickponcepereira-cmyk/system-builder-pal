-- 1) Perks por faixa de preço -------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_partner_product_perks(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  o record;
  v_card_days int := 0;
  v_tickets int := 0;
  v_points int;
  v_paid_at timestamptz;
  v_i int;
  v_product_id uuid;
  v_grants_perks boolean := false;
  v_price numeric := 0;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id;
  IF o.id IS NULL OR o.status <> 'paid' THEN RETURN; END IF;

  v_paid_at := COALESCE(o.paid_at, now());
  v_product_id := COALESCE(o.partner_product_id, o.professional_product_id);

  IF o.professional_product_id IS NOT NULL THEN
    SELECT COALESCE(grants_subscription_perks, false), COALESCE(price, 0)
      INTO v_grants_perks, v_price
      FROM public.professional_products
     WHERE id = o.professional_product_id;
  ELSIF o.partner_product_id IS NOT NULL THEN
    SELECT COALESCE(grants_subscription_perks, false), COALESCE(price, 0)
      INTO v_grants_perks, v_price
      FROM public.partner_products
     WHERE id = o.partner_product_id;
  END IF;

  IF COALESCE(v_grants_perks, false) THEN
    -- Override de produtos especiais
    v_card_days := 30;
    v_tickets := 1;
  ELSE
    -- Regra padrao por faixa de preco (usa o valor pago quando houver)
    SELECT b.card_days, b.challenge_tickets
      INTO v_card_days, v_tickets
      FROM public.compute_partner_product_benefits(GREATEST(COALESCE(o.gross_amount, 0), v_price)) b;
  END IF;

  v_card_days := COALESCE(v_card_days, 0);
  v_tickets := COALESCE(v_tickets, 0);

  IF v_card_days > 0 AND o.student_id IS NOT NULL
     AND COALESCE((o.metadata->>'perks_card_days')::int, 0) = 0 THEN
    UPDATE public.students s
       SET card_valid_until = GREATEST(COALESCE(s.card_valid_until, CURRENT_DATE), CURRENT_DATE) + (v_card_days || ' days')::interval
     WHERE s.id = o.student_id;
  END IF;

  IF v_tickets > 0 AND o.student_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.student_challenge_tokens t
                      WHERE t.student_id = o.student_id
                        AND t.notes = 'partner_order:' || o.id::text) THEN
    FOR v_i IN 1..v_tickets LOOP
      INSERT INTO public.student_challenge_tokens (student_id, source_product_id, granted_by, granted_at, notes, created_at)
      VALUES (o.student_id, v_product_id, 'partner_product_purchase', v_paid_at, 'partner_order:' || o.id::text, v_paid_at);
    END LOOP;
  END IF;

  v_points := public.compute_system_fee_points(COALESCE(o.system_fee, 0));
  IF v_points > 0 AND o.selling_coach_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.coach_points_log cpl
                      WHERE cpl.coach_id = o.selling_coach_id
                        AND cpl.metadata->>'partner_order_id' = o.id::text) THEN
    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata, created_at)
    VALUES (o.selling_coach_id, NULL, NULL, v_points,
            'Taxa de sistema (parceiro/profissional)',
            jsonb_build_object(
              'partner_order_id', o.id,
              'system_fee', o.system_fee,
              'partner_product_id', o.partner_product_id,
              'professional_product_id', o.professional_product_id
            ),
            v_paid_at);
  END IF;

  UPDATE public.partner_product_orders
     SET metadata = COALESCE(metadata,'{}'::jsonb)
                    || jsonb_build_object(
                         'perks_granted', true,
                         'perks_card_days', v_card_days,
                         'perks_tickets', v_tickets,
                         'perks_career_points', v_points
                       )
   WHERE id = _order_id;
END;
$fn$;

-- 2) Backfill dos pedidos pagos que ficaram sem carteirinha/tickets ------------
DO $bf$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.partner_product_orders
    WHERE status = 'paid'
      AND student_id IS NOT NULL
      AND COALESCE((metadata->>'perks_card_days')::int, 0) = 0
    ORDER BY COALESCE(paid_at, created_at)
  LOOP
    BEGIN
      PERFORM public.grant_partner_product_perks(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'backfill perks falhou para %: %', r.id, SQLERRM;
    END;
  END LOOP;
END;
$bf$;

-- 3) Leitura dos dados basicos dos proprios clientes ---------------------------
CREATE OR REPLACE FUNCTION public.profile_is_my_client(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $c$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.profile_id = _profile_id
      AND (
        s.coach_id = ANY (public.current_user_coach_ids())
        OR s.professional_coach_id = ANY (public.current_user_coach_ids())
        OR s.partner_id IN (SELECT public.current_partner_ids())
      )
  );
$c$;

GRANT EXECUTE ON FUNCTION public.profile_is_my_client(uuid) TO authenticated;

DROP POLICY IF EXISTS profiles_my_clients_select ON public.profiles;
CREATE POLICY profiles_my_clients_select
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.profile_is_my_client(id));