
DELETE FROM commissions;
DELETE FROM digital_purchases;
DELETE FROM freebie_redemptions;
DELETE FROM course_teacher_commissions;
DELETE FROM coach_created_courses;
DELETE FROM challenge_awards_config;
DELETE FROM challenge_winners;
DELETE FROM challenge_editions;
DELETE FROM challenge_groups;
DELETE FROM class_schedule;
DELETE FROM event_tickets;
DELETE FROM live_events;
DELETE FROM transactions;
DELETE FROM subscriptions;
DELETE FROM store_items;
DELETE FROM store_products;
DELETE FROM digital_products;
DELETE FROM products;
DELETE FROM freebies;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_fee_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketing_plan numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_costs numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS network_commission_percentage numeric DEFAULT 0;

ALTER TABLE public.store_items
  ADD COLUMN IF NOT EXISTS cost numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_fee_percentage numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS marketing_plan numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_costs numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_coach numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_level1 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_level2 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_level3 numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS app_fee_percentage numeric DEFAULT 0;

CREATE OR REPLACE FUNCTION public.validate_product_cost()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.cost IS NOT NULL AND NEW.price IS NOT NULL AND NEW.cost > NEW.price THEN
    RAISE EXCEPTION 'Custo (R$ %) não pode ser maior que o preço de venda (R$ %).', NEW.cost, NEW.price;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_products_cost ON public.products;
CREATE TRIGGER trg_validate_products_cost
  BEFORE INSERT OR UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_cost();

DROP TRIGGER IF EXISTS trg_validate_store_items_cost ON public.store_items;
CREATE TRIGGER trg_validate_store_items_cost
  BEFORE INSERT OR UPDATE ON public.store_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_cost();
