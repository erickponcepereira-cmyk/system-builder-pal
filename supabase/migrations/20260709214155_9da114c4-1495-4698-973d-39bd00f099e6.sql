
-- Fase 1: Reorganizar Herbalife como categoria dentro de "Suplementos"

INSERT INTO public.store_sections(id, name, slug, target_audience, is_active, sort_order) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Suplementos', 'suplementos-fitmind', 'fitmind', true, 7),
  ('11111111-0000-0000-0000-000000000002', 'Suplementos', 'suplementos-partner', 'partner',  true, 11);

INSERT INTO public.store_categories(id, section_id, name, slug, is_active, sort_order) VALUES
  ('22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Herbalife', 'herbalife-fitmind', true, 0),
  ('22222222-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', 'Herbalife', 'herbalife-partner', true, 0);

CREATE TEMP TABLE _herb_map(old_cat_id uuid PRIMARY KEY, new_sub_id uuid, side text) ON COMMIT DROP;

INSERT INTO _herb_map(old_cat_id, new_sub_id, side)
SELECT id, gen_random_uuid(),
       CASE WHEN section_id = 'bd4c4fd6-6979-4438-8548-02821cf4d842' THEN 'fitmind' ELSE 'partner' END
FROM public.store_categories
WHERE section_id IN ('bd4c4fd6-6979-4438-8548-02821cf4d842','619102ba-dab1-48df-8cc2-2dd39edade01');

INSERT INTO public.store_subcategories(id, category_id, name, slug, is_active, sort_order)
SELECT m.new_sub_id,
       CASE WHEN m.side='fitmind' THEN '22222222-0000-0000-0000-000000000001'::uuid
                                  ELSE '22222222-0000-0000-0000-000000000002'::uuid END,
       c.name,
       lower(regexp_replace(c.name, '[^a-zA-Z0-9]+', '-', 'g')) || '-' || substr(m.new_sub_id::text, 1, 8),
       true, 0
FROM _herb_map m
JOIN public.store_categories c ON c.id = m.old_cat_id;

UPDATE public.products p SET
  section_id = CASE WHEN m.side='fitmind' THEN '11111111-0000-0000-0000-000000000001'::uuid ELSE '11111111-0000-0000-0000-000000000002'::uuid END,
  category_id = CASE WHEN m.side='fitmind' THEN '22222222-0000-0000-0000-000000000001'::uuid ELSE '22222222-0000-0000-0000-000000000002'::uuid END,
  subcategory_id = m.new_sub_id
FROM _herb_map m
WHERE p.category_id = m.old_cat_id;

UPDATE public.partner_products p SET
  section_id = CASE WHEN m.side='fitmind' THEN '11111111-0000-0000-0000-000000000001'::uuid ELSE '11111111-0000-0000-0000-000000000002'::uuid END,
  category_id = CASE WHEN m.side='fitmind' THEN '22222222-0000-0000-0000-000000000001'::uuid ELSE '22222222-0000-0000-0000-000000000002'::uuid END,
  subcategory_id = m.new_sub_id
FROM _herb_map m
WHERE p.category_id = m.old_cat_id;

UPDATE public.professional_products p SET
  section_id = CASE WHEN m.side='fitmind' THEN '11111111-0000-0000-0000-000000000001'::uuid ELSE '11111111-0000-0000-0000-000000000002'::uuid END,
  category_id = CASE WHEN m.side='fitmind' THEN '22222222-0000-0000-0000-000000000001'::uuid ELSE '22222222-0000-0000-0000-000000000002'::uuid END,
  subcategory_id = m.new_sub_id
FROM _herb_map m
WHERE p.category_id = m.old_cat_id;

UPDATE public.products SET section_id='11111111-0000-0000-0000-000000000001', category_id='22222222-0000-0000-0000-000000000001'
WHERE section_id='bd4c4fd6-6979-4438-8548-02821cf4d842' AND category_id IS NULL;
UPDATE public.products SET section_id='11111111-0000-0000-0000-000000000002', category_id='22222222-0000-0000-0000-000000000002'
WHERE section_id='619102ba-dab1-48df-8cc2-2dd39edade01' AND category_id IS NULL;

UPDATE public.partner_products SET section_id='11111111-0000-0000-0000-000000000002', category_id='22222222-0000-0000-0000-000000000002'
WHERE section_id='619102ba-dab1-48df-8cc2-2dd39edade01' AND category_id IS NULL;
UPDATE public.partner_products SET section_id='11111111-0000-0000-0000-000000000001', category_id='22222222-0000-0000-0000-000000000001'
WHERE section_id='bd4c4fd6-6979-4438-8548-02821cf4d842' AND category_id IS NULL;

UPDATE public.professional_products SET section_id='11111111-0000-0000-0000-000000000002', category_id='22222222-0000-0000-0000-000000000002'
WHERE section_id='619102ba-dab1-48df-8cc2-2dd39edade01' AND category_id IS NULL;
UPDATE public.professional_products SET section_id='11111111-0000-0000-0000-000000000001', category_id='22222222-0000-0000-0000-000000000001'
WHERE section_id='bd4c4fd6-6979-4438-8548-02821cf4d842' AND category_id IS NULL;

UPDATE public.store_categories SET is_active=false
WHERE section_id IN ('bd4c4fd6-6979-4438-8548-02821cf4d842','619102ba-dab1-48df-8cc2-2dd39edade01');

UPDATE public.store_sections SET is_active=false, name = name || ' (legado)'
WHERE id IN ('bd4c4fd6-6979-4438-8548-02821cf4d842','619102ba-dab1-48df-8cc2-2dd39edade01');
