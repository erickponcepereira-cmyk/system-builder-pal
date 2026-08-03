DROP POLICY IF EXISTS "pp_select" ON public.professional_products;
DROP POLICY IF EXISTS "pp_select_public" ON public.professional_products;
DROP POLICY IF EXISTS "pp_select_authenticated" ON public.professional_products;

CREATE POLICY "pp_select_public"
ON public.professional_products
FOR SELECT
TO anon
USING (status = 'approved' AND is_active_by_professional = true);

CREATE POLICY "pp_select_authenticated"
ON public.professional_products
FOR SELECT
TO authenticated
USING (
  (status = 'approved' AND is_active_by_professional = true)
  OR (SELECT public.is_admin(auth.uid()))
  OR coach_id IN (
    SELECT c.id
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = (SELECT auth.uid())
      AND c.is_professional = true
  )
  OR coach_id IN (
    SELECT prof.id
    FROM public.coaches prof
    JOIN public.coaches upline ON upline.id = prof.upline_coach_id
    JOIN public.profiles up ON up.id = upline.profile_id
    WHERE up.user_id = (SELECT auth.uid())
      AND prof.is_professional = true
  )
);

CREATE OR REPLACE FUNCTION public.catalogo_publico_produto(_id uuid)
RETURNS TABLE (
  id uuid,
  fonte text,
  tipo text,
  nome text,
  subtitulo text,
  descricao text,
  preco numeric,
  preco_original numeric,
  imagem_url text,
  secao_id uuid,
  categoria_id uuid,
  subcategoria_id uuid,
  badge text,
  estoque numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT
    p.id,
    'fitmind'::text AS fonte,
    COALESCE(p.kind::text, 'store') AS tipo,
    p.name,
    p.subtitle,
    COALESCE(p.short_description, p.description) AS descricao,
    p.price,
    p.original_price,
    p.image_url,
    p.section_id,
    p.category_id,
    p.subcategory_id,
    p.badge_label,
    p.stock::numeric
  FROM public.products p
  WHERE p.id = _id
    AND (
      (p.kind IS NULL AND p.status = 'active')
      OR (p.kind IS NOT NULL AND p.is_active = true)
    )

  UNION ALL

  SELECT
    pp.id,
    'partner'::text AS fonte,
    'partner'::text AS tipo,
    pp.name,
    NULL::text AS subtitulo,
    pp.description,
    pp.price,
    pp.original_price,
    pp.image_url,
    pp.section_id,
    pp.category_id,
    pp.subcategory_id,
    NULL::text AS badge,
    pp.stock::numeric
  FROM public.partner_products pp
  WHERE pp.id = _id
    AND pp.status = 'approved'

  UNION ALL

  SELECT
    pr.id,
    'professional'::text AS fonte,
    'professional'::text AS tipo,
    pr.name,
    NULL::text AS subtitulo,
    pr.description,
    pr.price,
    pr.original_price,
    pr.image_url,
    pr.section_id,
    pr.category_id,
    pr.subcategory_id,
    NULL::text AS badge,
    pr.stock::numeric
  FROM public.professional_products pr
  WHERE pr.id = _id
    AND pr.status = 'approved'
    AND pr.is_active_by_professional = true

  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.catalogo_publico_produto(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogo_publico_produto(uuid) TO anon, authenticated, service_role;