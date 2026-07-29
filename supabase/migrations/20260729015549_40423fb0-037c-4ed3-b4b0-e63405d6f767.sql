CREATE OR REPLACE FUNCTION public.store_admin_shelf_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.current_user_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  WITH all_products AS (
    SELECT p.id, p.name, 'Loja FitMind'::text AS origem, p.section_id, p.category_id, p.subcategory_id,
           CASE WHEN p.is_active THEN 'active' ELSE 'inactive' END AS status
    FROM public.products p
    WHERE p.kind IS NOT NULL
    UNION ALL
    SELECT pp.id, pp.name, 'Profissional'::text, pp.section_id, pp.category_id, pp.subcategory_id, pp.status::text
    FROM public.professional_products pp
    WHERE pp.deleted_at IS NULL AND coalesce(pp.kind::text, '') <> 'free'
    UNION ALL
    SELECT ap.id, ap.name, 'Parceiro'::text, ap.section_id, ap.category_id, ap.subcategory_id, ap.status::text
    FROM public.partner_products ap
    WHERE ap.deleted_at IS NULL AND coalesce(ap.kind::text, '') <> 'free'
  ),
  enriched AS (
    SELECT a.*, s.name AS section_name, s.is_active AS section_active,
           c.name AS category_name, c.is_active AS category_active
    FROM all_products a
    LEFT JOIN public.store_sections s ON s.id = a.section_id
    LEFT JOIN public.store_categories c ON c.id = a.category_id
  )
  SELECT jsonb_build_object(
    'section_counts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('section_id', section_id, 'total', total))
      FROM (SELECT section_id, count(*) AS total FROM enriched WHERE section_id IS NOT NULL GROUP BY section_id) q
    ), '[]'::jsonb),
    'category_counts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total))
      FROM (SELECT category_id, count(*) AS total FROM enriched WHERE category_id IS NOT NULL GROUP BY category_id) q
    ), '[]'::jsonb),
    'hidden', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'name', name, 'origem', origem, 'status', status,
        'section_name', section_name, 'category_name', category_name,
        'reason', reason
      ) ORDER BY origem, name)
      FROM (
        SELECT e.*,
          CASE
            WHEN e.status = 'pending' THEN 'Aguardando aprovação'
            WHEN e.section_id IS NULL THEN 'Sem seção definida'
            WHEN e.section_active IS FALSE THEN 'Seção desativada'
            WHEN e.category_id IS NULL THEN 'Sem subcategoria definida'
            WHEN e.category_active IS FALSE THEN 'Subcategoria desativada'
          END AS reason
        FROM enriched e
        WHERE e.status NOT IN ('rejected', 'inactive')
      ) h
      WHERE reason IS NOT NULL
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.store_admin_shelf_report() FROM public;
GRANT EXECUTE ON FUNCTION public.store_admin_shelf_report() TO authenticated;