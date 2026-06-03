-- ============================================================
-- Master Coach cross-sale: split 10% / 90% & enable client search
-- ============================================================

-- 1) Helper: is a coach a Master Coach (has master_coach badge)?
CREATE OR REPLACE FUNCTION public.is_master_coach(_coach_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_badges
    WHERE coach_id = _coach_id AND badge_key = 'master_coach'::public.coach_badge_key
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_master_coach(uuid) TO authenticated, anon, service_role;

-- 2) AFTER INSERT trigger on commissions:
--    When the order metadata contains master_cross_sale.seller_coach_id
--    and the seller is a Master Coach different from the titular coach,
--    take 10% from the titular's coach commission and create an extra
--    is_master_coach_commission=true row for the seller (Master Coach).
CREATE OR REPLACE FUNCTION public.apply_master_cross_sale_split()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_meta JSONB;
  v_seller_coach_id UUID;
  v_seller_profile_id UUID;
  v_master_amount NUMERIC(12,2);
  v_new_amount NUMERIC(12,2);
BEGIN
  -- Only act on titular-coach commission rows; skip master, network and referrals
  IF COALESCE(NEW.is_master_coach_commission, false) THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_referral, false) THEN RETURN NEW; END IF;
  IF NEW.beneficiary_coach_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.level, 0) <> 0 THEN RETURN NEW; END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN RETURN NEW; END IF;

  -- Resolve store order from transaction metadata
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

  v_master_amount := ROUND(NEW.amount * 0.10, 2);
  v_new_amount := NEW.amount - v_master_amount;

  -- Reduce the titular's slice (this row was just inserted by process_paid_transaction)
  UPDATE public.commissions
     SET amount = v_new_amount
   WHERE id = NEW.id;

  -- Insert the Master Coach's slice
  SELECT profile_id INTO v_seller_profile_id FROM public.coaches WHERE id = v_seller_coach_id;
  IF v_seller_profile_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.commissions (
    transaction_id, beneficiary_profile_id, beneficiary_coach_id, level,
    percentage, amount, status, available_at,
    is_master_coach_commission
  ) VALUES (
    NEW.transaction_id, v_seller_profile_id, v_seller_coach_id, 0,
    10, v_master_amount, NEW.status, NEW.available_at,
    true
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_master_cross_sale_split ON public.commissions;
CREATE TRIGGER trg_apply_master_cross_sale_split
  AFTER INSERT ON public.commissions
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_master_cross_sale_split();

-- 3) RPC: Master Coach searches all students across the platform
CREATE OR REPLACE FUNCTION public.list_all_students_for_master(_q text DEFAULT '')
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text,
  cpf text,
  coach_id uuid,
  coach_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_profile_id uuid;
  v_caller_coach_id uuid;
  v_query text;
BEGIN
  -- Resolve caller's coach record
  SELECT p.id INTO v_caller_profile_id
    FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_caller_profile_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT c.id INTO v_caller_coach_id
    FROM public.coaches c WHERE c.profile_id = v_caller_profile_id;
  IF v_caller_coach_id IS NULL THEN
    RAISE EXCEPTION 'Apenas coaches podem usar esta busca';
  END IF;

  IF NOT public.is_master_coach(v_caller_coach_id) THEN
    RAISE EXCEPTION 'Apenas Master Coaches podem buscar todos os clientes';
  END IF;

  v_query := '%' || COALESCE(TRIM(_q), '') || '%';

  RETURN QUERY
  SELECT
    s.id,
    p.name::text,
    p.email::text,
    p.phone::text,
    p.cpf::text,
    s.coach_id,
    cp.name::text AS coach_name
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  LEFT JOIN public.coaches c ON c.id = s.coach_id
  LEFT JOIN public.profiles cp ON cp.id = c.profile_id
  WHERE COALESCE(TRIM(_q), '') = ''
     OR p.name ILIKE v_query
     OR p.cpf ILIKE v_query
     OR p.email ILIKE v_query
  ORDER BY p.name ASC
  LIMIT 50;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_all_students_for_master(text) TO authenticated, service_role;