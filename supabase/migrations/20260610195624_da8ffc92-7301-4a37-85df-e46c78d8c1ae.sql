CREATE OR REPLACE FUNCTION public.apply_master_cross_sale_split()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  IF v_meta IS NULL THEN RETURN NEW; END IF;

  v_seller_coach_id := NULLIF(v_meta->'master_cross_sale'->>'seller_coach_id','')::uuid;
  IF v_seller_coach_id IS NULL THEN
    v_seller_coach_id := NULLIF(v_meta->>'created_by_coach_id','')::uuid;
  END IF;

  IF v_seller_coach_id IS NULL OR v_seller_coach_id = NEW.beneficiary_coach_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_master_coach(v_seller_coach_id) THEN RETURN NEW; END IF;

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
    is_master_coach_commission, slot_label
  ) VALUES (
    NEW.transaction_id, v_seller_profile_id, v_seller_coach_id, 0,
    v_pct, v_master_amount, NEW.status, NEW.available_at,
    true, 'Master Coach (cross-sale)'
  );

  RETURN NEW;
END;
$function$;

-- Backfill the affected Ana sale: re-insert level=0 commissions so the trigger fires.
DO $$
DECLARE
  v_tx_id UUID := 'cc800f30-1850-462c-a4c6-e9ebd6c02676';
  r RECORD;
  v_rows JSONB := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT * FROM public.commissions
    WHERE transaction_id = v_tx_id
      AND COALESCE(level,0) = 0
      AND COALESCE(is_master_coach_commission,false) = false
      AND COALESCE(is_referral,false) = false
  LOOP
    v_rows := v_rows || jsonb_build_object(
      'beneficiary_profile_id', r.beneficiary_profile_id,
      'beneficiary_coach_id', r.beneficiary_coach_id,
      'percentage', r.percentage,
      'amount', r.amount,
      'status', r.status::text,
      'available_at', r.available_at,
      'slot_label', r.slot_label
    );
  END LOOP;

  DELETE FROM public.commissions
   WHERE transaction_id = v_tx_id
     AND COALESCE(level,0) = 0
     AND COALESCE(is_master_coach_commission,false) = false
     AND COALESCE(is_referral,false) = false;

  FOR r IN SELECT * FROM jsonb_array_elements(v_rows) LOOP
    INSERT INTO public.commissions (
      transaction_id, beneficiary_profile_id, beneficiary_coach_id, level,
      percentage, amount, status, available_at, slot_label
    ) VALUES (
      v_tx_id,
      (r.value->>'beneficiary_profile_id')::uuid,
      (r.value->>'beneficiary_coach_id')::uuid,
      0,
      (r.value->>'percentage')::numeric,
      (r.value->>'amount')::numeric,
      (r.value->>'status')::commission_status,
      (r.value->>'available_at')::timestamptz,
      (r.value->>'slot_label')
    );
  END LOOP;
END$$;