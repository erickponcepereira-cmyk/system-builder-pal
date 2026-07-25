ALTER TABLE public.professional_products
  ALTER COLUMN coach_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS professional_products_coach_id_fkey;

ALTER TABLE public.professional_products
  ADD CONSTRAINT professional_products_coach_id_fkey
    FOREIGN KEY (coach_id) REFERENCES public.coaches(id) ON DELETE SET NULL;

ALTER TABLE public.partner_products
  ALTER COLUMN partner_id DROP NOT NULL,
  DROP CONSTRAINT IF EXISTS partner_products_partner_id_fkey;

ALTER TABLE public.partner_products
  ADD CONSTRAINT partner_products_partner_id_fkey
    FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL;