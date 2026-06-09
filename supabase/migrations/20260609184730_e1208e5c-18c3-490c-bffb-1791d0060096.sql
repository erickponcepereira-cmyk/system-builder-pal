-- Per-titular-coach configurable Master Coach commission percentage (10..70)
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS master_coach_commission_pct numeric NOT NULL DEFAULT 10;

-- Validation: keep within 10..70
CREATE OR REPLACE FUNCTION public.validate_master_coach_commission_pct()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.master_coach_commission_pct IS NULL THEN
    NEW.master_coach_commission_pct := 10;
  END IF;
  IF NEW.master_coach_commission_pct < 10 THEN NEW.master_coach_commission_pct := 10; END IF;
  IF NEW.master_coach_commission_pct > 70 THEN NEW.master_coach_commission_pct := 70; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_master_coach_commission_pct ON public.coaches;
CREATE TRIGGER trg_validate_master_coach_commission_pct
  BEFORE INSERT OR UPDATE OF master_coach_commission_pct ON public.coaches
  FOR EACH ROW EXECUTE FUNCTION public.validate_master_coach_commission_pct();

-- Replace cross-sale split trigger to read pct from the titular coach
CREATE OR REPLACE FUNCTION public.apply_master_cross_sale_split()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_meta JSONB;
  v_seller_coach_id UUID;
  v_seller_profile_id UUID;
  v_pct NUMERIC(6,2);
  v_master_amount NUMERIC(12,2);
  v_new_amount NUMERIC(12,2);
BEGIN
  IF COALESCE(NEW.is_master_coach_commission, false) THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_referral, false) THEN RETURN NEW; END IF;
  IF NEW.beneficiary_coach_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.level, 0) <> 0 THEN RETURN NEW; END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN RETURN NEW; END IF;

  SELECT (t.metadata->>'store_order_id')::uuid
    INTO v_order_id
  FROM public.transactions t WHERE t.id = NEW.transaction_id;
  IF v_order_id IS NULL THEN RETURN NEW; END IF;

  SELECT metadata INTO v_meta FROM public.store_orders WHERE id = v_order_id;
  IF v_meta IS NULL OR v_meta->'master_cross_sale' IS NULL THEN RETURN NEW; END IF;

  v_seller_coach_id := (v_meta->'master_cross_sale'->>'seller_coach_id')::uuid;
  IF v_seller_coach_id IS NULL OR v_seller_coach_id = NEW.beneficiary_coach_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_master_coach(v_seller_coach_id) THEN RETURN NEW; END IF;

  -- Read pct from titular coach (beneficiary)
  SELECT COALESCE(master_coach_commission_pct, 10) INTO v_pct
    FROM public.coaches WHERE id = NEW.beneficiary_coach_id;
  IF v_pct IS NULL THEN v_pct := 10; END IF;
  IF v_pct < 10 THEN v_pct := 10; END IF;
  IF v_pct > 70 THEN v_pct := 70; END IF;

  v_master_amount := ROUND(NEW.amount * (v_pct / 100.0), 2);
  v_new_amount := NEW.amount - v_master_amount;

  UPDATE public.commissions SET amount = v_new_amount WHERE id = NEW.id;

  SELECT profile_id INTO v_seller_profile_id FROM public.coaches WHERE id = v_seller_coach_id;
  IF v_seller_profile_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.commissions (
    transaction_id, beneficiary_profile_id, beneficiary_coach_id, level,
    percentage, amount, status, available_at,
    is_master_coach_commission
  ) VALUES (
    NEW.transaction_id, v_seller_profile_id, v_seller_coach_id, 0,
    v_pct, v_master_amount, NEW.status, NEW.available_at,
    true
  );

  RETURN NEW;
END;
$$;