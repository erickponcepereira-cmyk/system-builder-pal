ALTER TABLE public.partner_product_orders
  DROP CONSTRAINT IF EXISTS partner_product_orders_partner_id_fkey,
  DROP CONSTRAINT IF EXISTS partner_product_orders_partner_product_id_fkey,
  DROP CONSTRAINT IF EXISTS partner_product_orders_professional_coach_id_fkey,
  DROP CONSTRAINT IF EXISTS partner_product_orders_professional_product_id_fkey;

ALTER TABLE public.partner_product_orders
  ADD CONSTRAINT partner_product_orders_partner_id_fkey
    FOREIGN KEY (partner_id) REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD CONSTRAINT partner_product_orders_partner_product_id_fkey
    FOREIGN KEY (partner_product_id) REFERENCES public.partner_products(id) ON DELETE SET NULL,
  ADD CONSTRAINT partner_product_orders_professional_coach_id_fkey
    FOREIGN KEY (professional_coach_id) REFERENCES public.coaches(id) ON DELETE SET NULL,
  ADD CONSTRAINT partner_product_orders_professional_product_id_fkey
    FOREIGN KEY (professional_product_id) REFERENCES public.professional_products(id) ON DELETE SET NULL;

ALTER TABLE public.professional_appointments
  DROP CONSTRAINT IF EXISTS professional_appointments_product_id_fkey;

ALTER TABLE public.professional_appointments
  ADD CONSTRAINT professional_appointments_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES public.professional_products(id) ON DELETE CASCADE;