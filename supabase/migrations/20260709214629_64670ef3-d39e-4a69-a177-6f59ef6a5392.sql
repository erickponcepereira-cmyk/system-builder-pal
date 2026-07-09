
CREATE OR REPLACE FUNCTION public.sync_mirrored_products()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sincroniza partner_products espelhados
  UPDATE public.partner_products
     SET name           = NEW.name,
         description    = NEW.description,
         image_url      = NEW.image_url,
         image_urls     = COALESCE(NEW.image_urls, ARRAY[]::text[]),
         price          = NEW.price,
         original_price = NEW.original_price,
         stock          = NEW.stock,
         is_physical    = COALESCE(NEW.delivery_days IS NOT NULL, false) OR is_physical,
         delivery_days  = NEW.delivery_days,
         updated_at     = now()
   WHERE mirror_source_product_id = NEW.id;

  -- Sincroniza professional_products espelhados
  UPDATE public.professional_products
     SET name           = NEW.name,
         description    = NEW.description,
         image_url      = NEW.image_url,
         image_urls     = COALESCE(NEW.image_urls, ARRAY[]::text[]),
         price          = NEW.price,
         original_price = NEW.original_price,
         stock          = NEW.stock,
         is_physical    = COALESCE(NEW.delivery_days IS NOT NULL, false) OR is_physical,
         delivery_days  = NEW.delivery_days,
         updated_at     = now()
   WHERE mirror_source_product_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_mirrored_products ON public.products;
CREATE TRIGGER trg_sync_mirrored_products
AFTER UPDATE ON public.products
FOR EACH ROW
WHEN (OLD.name IS DISTINCT FROM NEW.name
   OR OLD.description IS DISTINCT FROM NEW.description
   OR OLD.image_url IS DISTINCT FROM NEW.image_url
   OR OLD.image_urls IS DISTINCT FROM NEW.image_urls
   OR OLD.price IS DISTINCT FROM NEW.price
   OR OLD.original_price IS DISTINCT FROM NEW.original_price
   OR OLD.stock IS DISTINCT FROM NEW.stock
   OR OLD.delivery_days IS DISTINCT FROM NEW.delivery_days)
EXECUTE FUNCTION public.sync_mirrored_products();
