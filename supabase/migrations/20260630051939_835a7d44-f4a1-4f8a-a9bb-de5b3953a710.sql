
-- 1) Helper: benefícios por faixa de preço
CREATE OR REPLACE FUNCTION public.compute_partner_product_benefits(_price numeric)
RETURNS TABLE(card_days int, challenge_tickets int)
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN _price >= 1000 THEN 90
      WHEN _price >= 500 THEN 60
      WHEN _price > 150 THEN 30
      WHEN _price >= 100 THEN 15
      ELSE 7
    END,
    CASE
      WHEN _price >= 1000 THEN 3
      WHEN _price >= 500 THEN 2
      WHEN _price > 150 THEN 1
      ELSE 0
    END;
$$;
GRANT EXECUTE ON FUNCTION public.compute_partner_product_benefits(numeric) TO authenticated, service_role, anon;

-- 2) Helper: pontos por taxa de sistema (1 ponto / R$2, mínimo R$2, floor)
CREATE OR REPLACE FUNCTION public.compute_system_fee_points(_system_fee numeric)
RETURNS int
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN COALESCE(_system_fee,0) < 2 THEN 0 ELSE FLOOR(_system_fee / 2)::int END;
$$;
GRANT EXECUTE ON FUNCTION public.compute_system_fee_points(numeric) TO authenticated, service_role, anon;

-- 3) Trigger para conceder benefícios quando o pedido é pago (idempotente)
CREATE OR REPLACE FUNCTION public.grant_partner_product_perks(_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o record;
  v_card_days int;
  v_tickets int;
  v_points int;
  v_paid_at timestamptz;
  v_base date;
  v_i int;
  v_product_id uuid;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id;
  IF o.id IS NULL OR o.status <> 'paid' THEN RETURN; END IF;

  v_paid_at := COALESCE(o.paid_at, now());
  SELECT card_days, challenge_tickets INTO v_card_days, v_tickets
    FROM public.compute_partner_product_benefits(COALESCE(o.gross_amount, 0));
  v_product_id := COALESCE(o.partner_product_id, o.professional_product_id);

  -- 3a) Carteirinha: soma N dias a partir do maior entre hoje e card_valid_until atual
  IF v_card_days > 0 AND o.student_id IS NOT NULL THEN
    -- Marca de idempotência em metadata
    IF COALESCE((o.metadata->>'perks_granted')::boolean, false) IS NOT TRUE THEN
      UPDATE public.students s
         SET card_valid_until = GREATEST(COALESCE(s.card_valid_until, CURRENT_DATE), CURRENT_DATE) + (v_card_days || ' days')::interval
       WHERE s.id = o.student_id;
    END IF;
  END IF;

  -- 3b) Tickets do desafio
  IF v_tickets > 0 AND o.student_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.student_challenge_tokens t
                      WHERE t.student_id = o.student_id
                        AND t.notes = 'partner_order:' || o.id::text) THEN
    FOR v_i IN 1..v_tickets LOOP
      INSERT INTO public.student_challenge_tokens (student_id, source_product_id, granted_by, granted_at, notes, created_at)
      VALUES (o.student_id, v_product_id, 'partner_product_purchase', v_paid_at, 'partner_order:' || o.id::text, v_paid_at);
    END LOOP;
  END IF;

  -- 3c) Pontos de carreira (viagem/restaurante) — creditados ao coach vendedor
  v_points := public.compute_system_fee_points(COALESCE(o.system_fee, 0));
  IF v_points > 0 AND o.selling_coach_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.coach_points_log cpl
                      WHERE cpl.coach_id = o.selling_coach_id
                        AND cpl.metadata->>'partner_order_id' = o.id::text) THEN
    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata, created_at)
    VALUES (o.selling_coach_id, NULL, v_product_id, v_points,
            'Taxa de sistema (parceiro/profissional)',
            jsonb_build_object('partner_order_id', o.id, 'system_fee', o.system_fee),
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
$$;
GRANT EXECUTE ON FUNCTION public.grant_partner_product_perks(uuid) TO authenticated, service_role;

-- 4) Reaproveita: chama no final do processamento de pago
CREATE OR REPLACE FUNCTION public._wrap_grant_partner_product_perks_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.paid_at IS DISTINCT FROM NEW.paid_at) THEN
    PERFORM public.grant_partner_product_perks(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_partner_product_perks ON public.partner_product_orders;
CREATE TRIGGER trg_grant_partner_product_perks
AFTER INSERT OR UPDATE OF status, paid_at ON public.partner_product_orders
FOR EACH ROW EXECUTE FUNCTION public._wrap_grant_partner_product_perks_trigger();
