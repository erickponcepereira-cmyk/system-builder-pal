CREATE POLICY partner_products_admin_update
ON public.partner_products
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

ALTER FUNCTION public.store_admin_set_product_visibility(uuid, text, boolean) SECURITY INVOKER;