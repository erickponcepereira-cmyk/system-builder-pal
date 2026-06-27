-- Backfill das carteiras de parceiro/profissional a partir de partner_product_orders
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT partner_id FROM public.partner_product_orders
    WHERE partner_id IS NOT NULL AND status = 'paid'
  LOOP
    PERFORM public.recalc_partner_wallet(r.partner_id);
  END LOOP;

  FOR r IN
    SELECT DISTINCT professional_coach_id FROM public.partner_product_orders
    WHERE professional_coach_id IS NOT NULL AND status = 'paid'
  LOOP
    PERFORM public.recalc_professional_wallet(r.professional_coach_id);
  END LOOP;
END $$;

-- Trigger para manter as carteiras sincronizadas automaticamente
CREATE OR REPLACE FUNCTION public.sync_partner_professional_wallets_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.partner_id IS NOT NULL THEN
    PERFORM public.recalc_partner_wallet(NEW.partner_id);
  END IF;
  IF NEW.professional_coach_id IS NOT NULL THEN
    PERFORM public.recalc_professional_wallet(NEW.professional_coach_id);
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.partner_id IS NOT NULL AND OLD.partner_id IS DISTINCT FROM NEW.partner_id THEN
      PERFORM public.recalc_partner_wallet(OLD.partner_id);
    END IF;
    IF OLD.professional_coach_id IS NOT NULL AND OLD.professional_coach_id IS DISTINCT FROM NEW.professional_coach_id THEN
      PERFORM public.recalc_professional_wallet(OLD.professional_coach_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_partner_professional_wallets ON public.partner_product_orders;
CREATE TRIGGER trg_sync_partner_professional_wallets
AFTER INSERT OR UPDATE OF status, partner_net_amount, paid_at, partner_id, professional_coach_id
ON public.partner_product_orders
FOR EACH ROW
EXECUTE FUNCTION public.sync_partner_professional_wallets_on_order();
