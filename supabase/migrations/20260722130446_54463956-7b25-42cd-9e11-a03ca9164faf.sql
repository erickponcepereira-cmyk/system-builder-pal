
-- Add split_kind + percent_of_net to coproductions
ALTER TABLE public.product_coproductions
  ADD COLUMN IF NOT EXISTS split_kind text NOT NULL DEFAULT 'fixed'
    CHECK (split_kind IN ('percent','fixed')),
  ADD COLUMN IF NOT EXISTS percent_of_net numeric(5,2)
    CHECK (percent_of_net IS NULL OR (percent_of_net > 0 AND percent_of_net <= 100));

-- Allow fixed_amount_brl to be 0 when using percent (keep constraint >=0, drop NOT NULL)
ALTER TABLE public.product_coproductions ALTER COLUMN fixed_amount_brl DROP NOT NULL;

-- Rewrite credits trigger to support percent-of-net
CREATE OR REPLACE FUNCTION public.apply_coproduction_credits_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_product_type text;
  v_product_id uuid;
  v_net numeric(12,2);
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

  v_net := COALESCE(NEW.gross_amount,0) - COALESCE(NEW.payment_fee,0) - COALESCE(NEW.tax_amount,0);
  IF v_net < 0 THEN v_net := 0; END IF;

  FOR r IN
    SELECT id, collaborator_type, collaborator_id, split_kind, percent_of_net, fixed_amount_brl
    FROM public.product_coproductions
    WHERE product_type = v_product_type
      AND product_id = v_product_id
      AND status = 'accepted'
  LOOP
    IF r.split_kind = 'percent' AND r.percent_of_net IS NOT NULL THEN
      v_amount := ROUND(v_net * (r.percent_of_net / 100.0), 2);
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
