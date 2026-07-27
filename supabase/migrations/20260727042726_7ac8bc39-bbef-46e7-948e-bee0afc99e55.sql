-- 1) Guard trigger: uses_scheduling is always derived from existing schedule windows
CREATE OR REPLACE FUNCTION public.force_partner_product_uses_scheduling()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.uses_scheduling := EXISTS (
    SELECT 1 FROM public.partner_product_schedules s
    WHERE s.partner_product_id = NEW.id AND COALESCE(s.active, true)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_force_uses_scheduling ON public.partner_products;
CREATE TRIGGER trg_force_uses_scheduling
BEFORE INSERT OR UPDATE ON public.partner_products
FOR EACH ROW EXECUTE FUNCTION public.force_partner_product_uses_scheduling();

-- 2) Backfill existing rows
UPDATE public.partner_products pp
SET uses_scheduling = EXISTS (
  SELECT 1 FROM public.partner_product_schedules s
  WHERE s.partner_product_id = pp.id AND COALESCE(s.active, true)
)
WHERE pp.uses_scheduling IS DISTINCT FROM EXISTS (
  SELECT 1 FROM public.partner_product_schedules s
  WHERE s.partner_product_id = pp.id AND COALESCE(s.active, true)
);