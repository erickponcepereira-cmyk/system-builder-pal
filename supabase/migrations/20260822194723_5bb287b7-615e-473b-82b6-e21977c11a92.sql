REVOKE ALL ON public.store_banners FROM anon;
GRANT SELECT ON public.store_banners TO anon;

REVOKE ALL ON public.store_banners FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_banners TO authenticated;

-- service_role mantém ALL para operações administrativas e edge functions
GRANT ALL ON public.store_banners TO service_role;