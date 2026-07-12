
-- 1) Rename and normalize legacy Herbalife sections
UPDATE public.store_sections
SET name = 'Herbalife (desativado — migrado p/ Suplementos)',
    is_active = false,
    sort_order = 999,
    updated_at = now()
WHERE id IN ('bd4c4fd6-6979-4438-8548-02821cf4d842','619102ba-dab1-48df-8cc2-2dd39edade01');

-- 2) Reindex any product still pointing at a legacy Herbalife section
UPDATE public.products
SET section_id = '11111111-0000-0000-0000-000000000001'
WHERE section_id IN ('bd4c4fd6-6979-4438-8548-02821cf4d842','619102ba-dab1-48df-8cc2-2dd39edade01');

UPDATE public.partner_products
SET section_id = '11111111-0000-0000-0000-000000000002'
WHERE section_id IN ('bd4c4fd6-6979-4438-8548-02821cf4d842','619102ba-dab1-48df-8cc2-2dd39edade01');

UPDATE public.professional_products
SET section_id = '11111111-0000-0000-0000-000000000002'
WHERE section_id IN ('bd4c4fd6-6979-4438-8548-02821cf4d842','619102ba-dab1-48df-8cc2-2dd39edade01');

-- 3) Auto-assign Suplementos section for legacy Herbalife-named products going forward
CREATE OR REPLACE FUNCTION public.auto_assign_suplementos_section()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  fitmind_id  uuid := '11111111-0000-0000-0000-000000000001';
  partner_id  uuid := '11111111-0000-0000-0000-000000000002';
BEGIN
  -- Rewrite legacy Herbalife section ids to Suplementos
  IF NEW.section_id IN ('bd4c4fd6-6979-4438-8548-02821cf4d842','619102ba-dab1-48df-8cc2-2dd39edade01') THEN
    IF TG_TABLE_NAME = 'products' THEN
      NEW.section_id := fitmind_id;
    ELSE
      NEW.section_id := partner_id;
    END IF;
  END IF;

  -- If no section set and name starts with "Herbalife", assign automatically
  IF NEW.section_id IS NULL AND NEW.name ILIKE 'Herbalife %' THEN
    IF TG_TABLE_NAME = 'products' THEN
      NEW.section_id := fitmind_id;
    ELSE
      NEW.section_id := partner_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_suplementos_products ON public.products;
CREATE TRIGGER trg_auto_suplementos_products
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.auto_assign_suplementos_section();

DROP TRIGGER IF EXISTS trg_auto_suplementos_partner_products ON public.partner_products;
CREATE TRIGGER trg_auto_suplementos_partner_products
BEFORE INSERT OR UPDATE ON public.partner_products
FOR EACH ROW EXECUTE FUNCTION public.auto_assign_suplementos_section();

DROP TRIGGER IF EXISTS trg_auto_suplementos_professional_products ON public.professional_products;
CREATE TRIGGER trg_auto_suplementos_professional_products
BEFORE INSERT OR UPDATE ON public.professional_products
FOR EACH ROW EXECUTE FUNCTION public.auto_assign_suplementos_section();
