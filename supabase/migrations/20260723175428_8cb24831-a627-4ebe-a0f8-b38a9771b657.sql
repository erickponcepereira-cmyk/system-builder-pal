
ALTER TABLE public.product_coproductions
  ADD COLUMN IF NOT EXISTS has_cost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cost_amount_brl numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_bearer_type text,
  ADD COLUMN IF NOT EXISTS cost_bearer_id uuid,
  ADD COLUMN IF NOT EXISTS split_base text NOT NULL DEFAULT 'net';

ALTER TABLE public.product_coproductions
  DROP CONSTRAINT IF EXISTS product_coproductions_split_base_check;
ALTER TABLE public.product_coproductions
  ADD CONSTRAINT product_coproductions_split_base_check
  CHECK (split_base IN ('gross','net','net_after_cost'));

ALTER TABLE public.product_coproductions
  DROP CONSTRAINT IF EXISTS product_coproductions_cost_bearer_type_check;
ALTER TABLE public.product_coproductions
  ADD CONSTRAINT product_coproductions_cost_bearer_type_check
  CHECK (cost_bearer_type IS NULL OR cost_bearer_type IN ('partner','professional'));

CREATE OR REPLACE FUNCTION public.validate_coproduction_cost()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.has_cost THEN
    IF COALESCE(NEW.cost_amount_brl, 0) <= 0 THEN
      RAISE EXCEPTION 'Custo informado deve ser maior que zero.';
    END IF;
    IF NEW.cost_bearer_type IS NULL OR NEW.cost_bearer_id IS NULL THEN
      RAISE EXCEPTION 'Informe quem assumirá o custo.';
    END IF;
    IF NEW.split_base NOT IN ('gross','net_after_cost') THEN
      NEW.split_base := 'net_after_cost';
    END IF;
  ELSE
    NEW.cost_amount_brl := 0;
    NEW.cost_bearer_type := NULL;
    NEW.cost_bearer_id := NULL;
    IF NEW.split_base = 'net_after_cost' THEN
      NEW.split_base := 'net';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_coproduction_cost ON public.product_coproductions;
CREATE TRIGGER trg_validate_coproduction_cost
BEFORE INSERT OR UPDATE ON public.product_coproductions
FOR EACH ROW EXECUTE FUNCTION public.validate_coproduction_cost();

ALTER TABLE public.product_coproduction_credits
  ADD COLUMN IF NOT EXISTS is_cost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS note text;

ALTER TABLE public.product_coproduction_credits
  DROP CONSTRAINT IF EXISTS product_coproduction_credits_order_id_coproduction_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS product_coproduction_credits_order_coprod_kind_key
  ON public.product_coproduction_credits (order_id, coproduction_id, is_cost);

CREATE OR REPLACE FUNCTION public.apply_coproduction_credits_on_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product_type text;
  v_product_id uuid;
  v_product_name text;
  v_net numeric(12,2);
  v_gross numeric(12,2);
  r record;
  v_base numeric(12,2);
  v_split_amount numeric(12,2);
  v_cost numeric(12,2);
BEGIN
  IF NEW.status IS DISTINCT FROM 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;

  IF NEW.partner_product_id IS NOT NULL THEN
    v_product_type := 'partner';
    v_product_id := NEW.partner_product_id;
    SELECT name INTO v_product_name FROM public.partner_products WHERE id = v_product_id;
  ELSIF NEW.professional_product_id IS NOT NULL THEN
    v_product_type := 'professional';
    v_product_id := NEW.professional_product_id;
    SELECT name INTO v_product_name FROM public.professional_products WHERE id = v_product_id;
  ELSE
    RETURN NEW;
  END IF;

  v_gross := COALESCE(NEW.gross_amount, 0);
  v_net := COALESCE(
    NEW.partner_net_amount,
    v_gross - COALESCE(NEW.payment_fee,0) - COALESCE(NEW.tax_amount,0)
  );
  IF v_net < 0 THEN v_net := 0; END IF;

  FOR r IN
    SELECT id, collaborator_type, collaborator_id, creator_type, creator_id,
           split_kind, percent_of_net, fixed_amount_brl,
           has_cost, cost_amount_brl, cost_bearer_type, cost_bearer_id, split_base
    FROM public.product_coproductions
    WHERE product_type = v_product_type
      AND product_id = v_product_id
      AND status = 'accepted'
  LOOP
    v_cost := CASE WHEN r.has_cost THEN COALESCE(r.cost_amount_brl, 0) ELSE 0 END;

    IF r.split_base = 'gross' THEN
      v_base := v_gross - v_cost;
    ELSIF r.split_base = 'net_after_cost' THEN
      v_base := v_net - v_cost;
    ELSE
      v_base := v_net;
    END IF;
    IF v_base < 0 THEN v_base := 0; END IF;

    IF r.split_kind = 'percent' AND r.percent_of_net IS NOT NULL THEN
      v_split_amount := ROUND(v_base * (r.percent_of_net / 100.0), 2);
    ELSE
      v_split_amount := COALESCE(r.fixed_amount_brl, 0);
    END IF;

    IF v_split_amount > 0 THEN
      INSERT INTO public.product_coproduction_credits
        (order_id, coproduction_id, collaborator_type, collaborator_id, amount_brl, is_cost, note)
      VALUES
        (NEW.id, r.id, r.collaborator_type, r.collaborator_id, v_split_amount, false,
         'Co-produção — ' || COALESCE(v_product_name, 'produto'))
      ON CONFLICT (order_id, coproduction_id, is_cost) DO NOTHING;
    END IF;

    IF v_cost > 0
       AND r.cost_bearer_type IS NOT NULL AND r.cost_bearer_id IS NOT NULL
       AND NOT (r.cost_bearer_type = r.creator_type AND r.cost_bearer_id = r.creator_id) THEN
      INSERT INTO public.product_coproduction_credits
        (order_id, coproduction_id, collaborator_type, collaborator_id, amount_brl, is_cost, note)
      VALUES
        (NEW.id, r.id, r.cost_bearer_type, r.cost_bearer_id, v_cost, true,
         'Custo referente a: ' || COALESCE(v_product_name, 'produto'))
      ON CONFLICT (order_id, coproduction_id, is_cost) DO NOTHING;
    END IF;

    IF r.collaborator_type = 'partner' THEN
      PERFORM public.recalc_partner_wallet(r.collaborator_id);
    ELSE
      PERFORM public.recalc_professional_wallet(r.collaborator_id);
    END IF;
    IF v_cost > 0 AND r.cost_bearer_type IS NOT NULL THEN
      IF r.cost_bearer_type = 'partner' THEN
        PERFORM public.recalc_partner_wallet(r.cost_bearer_id);
      ELSE
        PERFORM public.recalc_professional_wallet(r.cost_bearer_id);
      END IF;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
