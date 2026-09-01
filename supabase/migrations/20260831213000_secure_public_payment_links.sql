-- Release batch: public checkout links use an unguessable bearer token. Order numbers are
-- intentionally human-readable and therefore cannot authorize access to an
-- order or to Mercado Pago operations.

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS public_payment_token uuid;

UPDATE public.store_orders
   SET public_payment_token = gen_random_uuid()
 WHERE public_payment_token IS NULL;

ALTER TABLE public.store_orders
  ALTER COLUMN public_payment_token SET DEFAULT gen_random_uuid(),
  ALTER COLUMN public_payment_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS store_orders_public_payment_token_uidx
  ON public.store_orders (public_payment_token);

COMMENT ON COLUMN public.store_orders.public_payment_token IS
  'Secret bearer token used only in public payment links; never use order_number as authorization.';

ALTER TABLE public.partner_product_orders
  ADD COLUMN IF NOT EXISTS public_payment_token uuid;

UPDATE public.partner_product_orders
   SET public_payment_token = gen_random_uuid()
 WHERE public_payment_token IS NULL;

ALTER TABLE public.partner_product_orders
  ALTER COLUMN public_payment_token SET DEFAULT gen_random_uuid(),
  ALTER COLUMN public_payment_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS partner_product_orders_public_payment_token_uidx
  ON public.partner_product_orders (public_payment_token);

COMMENT ON COLUMN public.partner_product_orders.public_payment_token IS
  'Secret bearer token used only in public payment links; never use order_number as authorization.';

CREATE OR REPLACE FUNCTION public.protect_public_payment_token()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Authenticated RPC callers cannot choose a predictable bearer token.
    IF NOT (
      coalesce(auth.role(), '') = 'service_role'
      OR (coalesce(auth.role(), '') = '' AND current_user IN ('postgres', 'service_role'))
    ) THEN
      NEW.public_payment_token := gen_random_uuid();
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.public_payment_token IS DISTINCT FROM OLD.public_payment_token
     AND NOT (
       coalesce(auth.role(), '') = 'service_role'
       OR (coalesce(auth.role(), '') = '' AND current_user IN ('postgres', 'service_role'))
     ) THEN
    RAISE EXCEPTION 'public_payment_token is server-managed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_public_payment_token() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS protect_store_order_public_payment_token ON public.store_orders;
CREATE TRIGGER protect_store_order_public_payment_token
BEFORE INSERT OR UPDATE OF public_payment_token ON public.store_orders
FOR EACH ROW EXECUTE FUNCTION public.protect_public_payment_token();

DROP TRIGGER IF EXISTS protect_partner_order_public_payment_token ON public.partner_product_orders;
CREATE TRIGGER protect_partner_order_public_payment_token
BEFORE INSERT OR UPDATE OF public_payment_token ON public.partner_product_orders
FOR EACH ROW EXECUTE FUNCTION public.protect_public_payment_token();

-- Keep the existing authenticated wrapper compatible while returning the new
-- secure URL for every order created after this migration.
CREATE OR REPLACE FUNCTION public.create_partner_product_order_checkout(
  _professional_product_id uuid,
  _payment_method text DEFAULT 'pix'::text,
  _buyer_student_id uuid DEFAULT NULL::uuid,
  _referred_by_student_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_public_payment_token uuid;
  v_total numeric;
BEGIN
  v_order_id := public.create_partner_product_order(
    _professional_product_id,
    _payment_method,
    _buyer_student_id,
    _referred_by_student_id
  );

  SELECT order_number, public_payment_token, gross_amount
    INTO v_order_number, v_public_payment_token, v_total
    FROM public.partner_product_orders
   WHERE id = v_order_id;

  IF v_order_number IS NULL OR v_order_number !~ '^PP-[A-Z0-9]+$' THEN
    RAISE EXCEPTION 'Número do pedido não foi gerado corretamente';
  END IF;

  IF v_public_payment_token IS NULL THEN
    RAISE EXCEPTION 'Token público de pagamento não foi gerado';
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'public_payment_token', v_public_payment_token,
    'total', v_total,
    'pay_url', '/pay/' || v_public_payment_token::text
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_product_order_checkout(uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partner_product_order_checkout(uuid,text,uuid,uuid) TO authenticated, service_role;
