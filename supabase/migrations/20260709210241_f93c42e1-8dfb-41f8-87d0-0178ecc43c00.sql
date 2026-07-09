
-- Produtos: marcar como físicos e prazo médio
ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS is_physical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_days integer;

ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS is_physical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_days integer;

ALTER TABLE public.store_products
  ADD COLUMN IF NOT EXISTS is_physical boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS delivery_days integer;

-- Endereço padrão do aluno para entregas
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS shipping_zip text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS shipping_number text,
  ADD COLUMN IF NOT EXISTS shipping_reference text,
  ADD COLUMN IF NOT EXISTS shipping_location_url text;

-- Pedidos partner/professional: dados de entrega
ALTER TABLE public.partner_product_orders
  ADD COLUMN IF NOT EXISTS shipping_zip text,
  ADD COLUMN IF NOT EXISTS shipping_address text,
  ADD COLUMN IF NOT EXISTS shipping_number text,
  ADD COLUMN IF NOT EXISTS shipping_reference text,
  ADD COLUMN IF NOT EXISTS shipping_location_url text,
  ADD COLUMN IF NOT EXISTS delivery_days integer,
  ADD COLUMN IF NOT EXISTS delivery_started_at timestamp with time zone;

-- Pedidos fitmind: complementar endereço e prazo
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS shipping_number text,
  ADD COLUMN IF NOT EXISTS shipping_reference text,
  ADD COLUMN IF NOT EXISTS shipping_location_url text,
  ADD COLUMN IF NOT EXISTS delivery_days integer,
  ADD COLUMN IF NOT EXISTS delivery_started_at timestamp with time zone;

-- Ao marcar como pago, iniciar contador de entrega para pedidos físicos
CREATE OR REPLACE FUNCTION public.set_delivery_started_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.delivery_started_at IS NULL AND NEW.delivery_days IS NOT NULL THEN
    NEW.delivery_started_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ppo_delivery_started ON public.partner_product_orders;
CREATE TRIGGER trg_ppo_delivery_started
BEFORE UPDATE ON public.partner_product_orders
FOR EACH ROW EXECUTE FUNCTION public.set_delivery_started_at();

DROP TRIGGER IF EXISTS trg_store_orders_delivery_started ON public.store_orders;
CREATE TRIGGER trg_store_orders_delivery_started
BEFORE UPDATE ON public.store_orders
FOR EACH ROW EXECUTE FUNCTION public.set_delivery_started_at();
