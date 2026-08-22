CREATE TABLE IF NOT EXISTS public.store_banners (
  id           uuid primary key default gen_random_uuid(),
  kind         text not null default 'banner' check (kind in ('banner','popup')),
  title        text not null,
  subtitle     text,
  badge        text,
  image_url    text,
  link_url     text,
  link_label   text,
  is_active    boolean not null default true,
  sort_order   integer not null default 0,
  starts_at    timestamptz,
  ends_at      timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

GRANT SELECT ON public.store_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_banners TO authenticated;
GRANT ALL ON public.store_banners TO service_role;

CREATE INDEX IF NOT EXISTS idx_store_banners_ativo
  ON public.store_banners (kind, is_active, sort_order);

ALTER TABLE public.store_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_banners_public_read ON public.store_banners
FOR SELECT TO anon, authenticated
USING (
  is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at   IS NULL OR ends_at   >  now())
);

CREATE POLICY store_banners_admin_write ON public.store_banners
FOR ALL TO authenticated
USING      (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.update_store_banners_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_store_banners_updated_at
BEFORE UPDATE ON public.store_banners
FOR EACH ROW
EXECUTE FUNCTION public.update_store_banners_updated_at();

INSERT INTO public.store_banners (kind, title, subtitle, badge, link_url, link_label, sort_order)
VALUES
  ('banner', 'Formação de Coach FitMind',
   'Incluída na sua mensalidade. Comece agora.',
   'Curso', '/student/library', 'Assistir', 1),
  ('banner', 'Gratuitos dos parceiros',
   'Ative a carteirinha e resgate na sua cidade.',
   'Grátis', '/student/freebies', 'Ver gratuitos', 2)
ON CONFLICT DO NOTHING;