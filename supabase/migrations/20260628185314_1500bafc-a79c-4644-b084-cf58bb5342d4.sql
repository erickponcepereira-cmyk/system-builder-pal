
-- Add sale_channel to track if order was created by student (store) or coach panel (coach)
ALTER TABLE public.partner_product_orders
  ADD COLUMN IF NOT EXISTS sale_channel text NOT NULL DEFAULT 'store'
  CHECK (sale_channel IN ('store','coach'));

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS sale_channel text NOT NULL DEFAULT 'store'
  CHECK (sale_channel IN ('store','coach'));

-- BEFORE INSERT trigger: classify channel based on caller vs buyer student.
CREATE OR REPLACE FUNCTION public.set_order_sale_channel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_user uuid;
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    -- service role / no auth context: keep default
    RETURN NEW;
  END IF;
  SELECT p.user_id INTO v_buyer_user
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.id = NEW.student_id
  LIMIT 1;
  IF v_buyer_user IS NOT NULL AND v_buyer_user <> v_caller THEN
    NEW.sale_channel := 'coach';
  ELSE
    NEW.sale_channel := 'store';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ppo_set_sale_channel ON public.partner_product_orders;
CREATE TRIGGER trg_ppo_set_sale_channel
  BEFORE INSERT ON public.partner_product_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_sale_channel();

DROP TRIGGER IF EXISTS trg_so_set_sale_channel ON public.store_orders;
CREATE TRIGGER trg_so_set_sale_channel
  BEFORE INSERT ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_sale_channel();
