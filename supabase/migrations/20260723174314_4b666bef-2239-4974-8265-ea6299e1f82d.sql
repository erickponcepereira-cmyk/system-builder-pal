CREATE OR REPLACE FUNCTION public.apply_coproduction_credits_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_type text;
  v_product_id uuid;
  v_base numeric(12,2);
  r record;
  v_amount numeric(12,2);
BEGIN
  IF NEW.status IS DISTINCT FROM 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;

  IF NEW.partner_product_id IS NOT NULL THEN
    v_product_type := 'partner';
    v_product_id := NEW.partner_product_id;
  ELSIF NEW.professional_product_id IS NOT NULL THEN
    v_product_type := 'professional';
    v_product_id := NEW.professional_product_id;
  ELSE
    RETURN NEW;
  END IF;

  -- Base do rateio = líquido do criador (o "valor a distribuir" mostrado no editor).
  -- Fallback para (bruto - gateway - imposto) se por algum motivo não estiver preenchido.
  v_base := COALESCE(
    NEW.partner_net_amount,
    COALESCE(NEW.gross_amount,0) - COALESCE(NEW.payment_fee,0) - COALESCE(NEW.tax_amount,0)
  );
  IF v_base < 0 THEN v_base := 0; END IF;

  FOR r IN
    SELECT id, collaborator_type, collaborator_id, split_kind, percent_of_net, fixed_amount_brl
    FROM public.product_coproductions
    WHERE product_type = v_product_type
      AND product_id = v_product_id
      AND status = 'accepted'
  LOOP
    IF r.split_kind = 'percent' AND r.percent_of_net IS NOT NULL THEN
      v_amount := ROUND(v_base * (r.percent_of_net / 100.0), 2);
    ELSE
      v_amount := COALESCE(r.fixed_amount_brl, 0);
    END IF;

    IF v_amount <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.product_coproduction_credits (order_id, coproduction_id, collaborator_type, collaborator_id, amount_brl)
    VALUES (NEW.id, r.id, r.collaborator_type, r.collaborator_id, v_amount)
    ON CONFLICT (order_id, coproduction_id) DO NOTHING;

    IF r.collaborator_type = 'partner' THEN
      PERFORM public.recalc_partner_wallet(r.collaborator_id);
    ELSE
      PERFORM public.recalc_professional_wallet(r.collaborator_id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;