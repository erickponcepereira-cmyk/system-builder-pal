
-- Backfill uses_scheduling based on existing schedules
UPDATE public.partner_products p
SET uses_scheduling = EXISTS (
  SELECT 1 FROM public.partner_product_schedules s WHERE s.partner_product_id = p.id
)
WHERE uses_scheduling IS DISTINCT FROM EXISTS (
  SELECT 1 FROM public.partner_product_schedules s WHERE s.partner_product_id = p.id
);

-- Sync trigger function
CREATE OR REPLACE FUNCTION public.sync_partner_product_uses_scheduling()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _pid uuid;
BEGIN
  _pid := COALESCE(NEW.partner_product_id, OLD.partner_product_id);
  UPDATE public.partner_products
  SET uses_scheduling = EXISTS (
    SELECT 1 FROM public.partner_product_schedules s WHERE s.partner_product_id = _pid
  )
  WHERE id = _pid;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_uses_scheduling_ins ON public.partner_product_schedules;
DROP TRIGGER IF EXISTS trg_sync_uses_scheduling_upd ON public.partner_product_schedules;
DROP TRIGGER IF EXISTS trg_sync_uses_scheduling_del ON public.partner_product_schedules;

CREATE TRIGGER trg_sync_uses_scheduling_ins
AFTER INSERT ON public.partner_product_schedules
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_product_uses_scheduling();

CREATE TRIGGER trg_sync_uses_scheduling_upd
AFTER UPDATE ON public.partner_product_schedules
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_product_uses_scheduling();

CREATE TRIGGER trg_sync_uses_scheduling_del
AFTER DELETE ON public.partner_product_schedules
FOR EACH ROW EXECUTE FUNCTION public.sync_partner_product_uses_scheduling();
