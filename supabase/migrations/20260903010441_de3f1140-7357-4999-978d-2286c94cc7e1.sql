CREATE TABLE public.store_product_visibility_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL,
  product_source text NOT NULL CHECK (product_source IN ('partner', 'professional')),
  product_name text NOT NULL,
  previous_visible boolean NOT NULL,
  new_visible boolean NOT NULL,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.store_product_visibility_audit TO authenticated;
GRANT ALL ON public.store_product_visibility_audit TO service_role;

ALTER TABLE public.store_product_visibility_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_product_visibility_audit_admin_select
ON public.store_product_visibility_audit
FOR SELECT
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.audit_store_product_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_profile_id uuid;
  v_source text;
  v_previous boolean;
  v_new boolean;
BEGIN
  IF TG_TABLE_NAME = 'partner_products' THEN
    v_source := 'partner';
    v_previous := OLD.is_active_by_partner;
    v_new := NEW.is_active_by_partner;
  ELSE
    v_source := 'professional';
    v_previous := OLD.is_active_by_professional;
    v_new := NEW.is_active_by_professional;
  END IF;

  IF v_previous IS NOT DISTINCT FROM v_new THEN
    RETURN NEW;
  END IF;

  SELECT id
  INTO v_actor_profile_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1;

  INSERT INTO public.store_product_visibility_audit (
    product_id,
    product_source,
    product_name,
    previous_visible,
    new_visible,
    actor_profile_id
  ) VALUES (
    NEW.id,
    v_source,
    NEW.name,
    v_previous,
    v_new,
    v_actor_profile_id
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_store_product_visibility() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_audit_partner_product_visibility ON public.partner_products;
CREATE TRIGGER trg_audit_partner_product_visibility
AFTER UPDATE OF is_active_by_partner ON public.partner_products
FOR EACH ROW
EXECUTE FUNCTION public.audit_store_product_visibility();

DROP TRIGGER IF EXISTS trg_audit_professional_product_visibility ON public.professional_products;
CREATE TRIGGER trg_audit_professional_product_visibility
AFTER UPDATE OF is_active_by_professional ON public.professional_products
FOR EACH ROW
EXECUTE FUNCTION public.audit_store_product_visibility();

CREATE OR REPLACE FUNCTION public.store_admin_set_product_visibility(
  _product_id uuid,
  _source text,
  _visible boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores';
  END IF;

  IF _source = 'Parceiro' THEN
    IF _visible AND NOT EXISTS (
      SELECT 1
      FROM public.partner_products pp
      JOIN public.partners p ON p.id = pp.partner_id
      WHERE pp.id = _product_id
        AND pp.status = 'approved'
        AND pp.is_ready_for_sale = true
        AND pp.deleted_at IS NULL
        AND p.status = 'approved'
    ) THEN
      RAISE EXCEPTION 'O produto ainda possui outros bloqueios e não pode ser reativado';
    END IF;

    UPDATE public.partner_products
    SET is_active_by_partner = _visible
    WHERE id = _product_id;
  ELSIF _source = 'Profissional' THEN
    IF _visible AND NOT EXISTS (
      SELECT 1
      FROM public.professional_products pp
      JOIN public.coaches c ON c.id = pp.coach_id
      WHERE pp.id = _product_id
        AND pp.status = 'approved'
        AND pp.is_ready_for_sale = true
        AND pp.deleted_at IS NULL
        AND c.is_professional = true
    ) THEN
      RAISE EXCEPTION 'O produto ainda possui outros bloqueios e não pode ser reativado';
    END IF;

    UPDATE public.professional_products
    SET is_active_by_professional = _visible
    WHERE id = _product_id;
  ELSE
    RAISE EXCEPTION 'Origem de produto inválida';
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto não encontrado';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.store_admin_set_product_visibility(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_admin_set_product_visibility(uuid, text, boolean) TO authenticated;

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
    SELECT
      p.id,
      p.name,
      'Loja FitMind'::text AS origem,
      'FitMind'::text AS seller_name,
      p.section_id,
      p.category_id,
      p.status::text AS status,
      p.is_active AS seller_visible,
      true AS ready_for_sale,
      false AS is_deleted,
      true AS owner_available,
      false AS network_restricted
    FROM public.products p
    WHERE p.kind IS NOT NULL

    UNION ALL

    SELECT
      pp.id,
      pp.name,
      'Profissional'::text,
      coalesce(pr.name, 'Profissional'),
      pp.section_id,
      pp.category_id,
      pp.status::text,
      pp.is_active_by_professional,
      pp.is_ready_for_sale,
      pp.deleted_at IS NOT NULL,
      coalesce(c.is_professional, false),
      coalesce(pp.restrict_to_networks, false)
    FROM public.professional_products pp
    LEFT JOIN public.coaches c ON c.id = pp.coach_id
    LEFT JOIN public.profiles pr ON pr.id = c.profile_id

    UNION ALL

    SELECT
      pp.id,
      pp.name,
      'Parceiro'::text,
      coalesce(pa.fantasy_name, 'Parceiro'),
      pp.section_id,
      pp.category_id,
      pp.status::text,
      pp.is_active_by_partner,
      pp.is_ready_for_sale,
      pp.deleted_at IS NOT NULL,
      coalesce(pa.status = 'approved', false),
      coalesce(pp.restrict_to_networks, false)
    FROM public.partner_products pp
    LEFT JOIN public.partners pa ON pa.id = pp.partner_id
  ),
  enriched AS (
    SELECT
      a.*,
      s.name AS section_name,
      s.is_active AS section_active,
      c.name AS category_name,
      c.is_active AS category_active,
      CASE
        WHEN a.is_deleted THEN 'Produto arquivado'
        WHEN a.status = 'pending' THEN 'Aguardando aprovação'
        WHEN a.status = 'rejected' THEN 'Produto rejeitado'
        WHEN a.status NOT IN ('approved', 'active') THEN 'Produto inativo'
        WHEN NOT a.owner_available AND a.origem = 'Parceiro' THEN 'Parceiro indisponível'
        WHEN NOT a.owner_available AND a.origem = 'Profissional' THEN 'Profissional indisponível'
        WHEN NOT a.seller_visible AND a.origem = 'Parceiro' THEN 'Oculto pelo parceiro'
        WHEN NOT a.seller_visible AND a.origem = 'Profissional' THEN 'Oculto pelo profissional'
        WHEN NOT a.seller_visible THEN 'Produto inativo'
        WHEN NOT a.ready_for_sale THEN 'Não está pronto para venda'
        WHEN a.section_id IS NULL THEN 'Sem seção definida'
        WHEN a.section_active IS DISTINCT FROM true THEN 'Seção desativada'
        WHEN a.category_id IS NULL THEN 'Sem subcategoria definida'
        WHEN a.category_active IS DISTINCT FROM true THEN 'Subcategoria desativada'
        WHEN a.network_restricted THEN 'Restrito a uma rede'
      END AS reason
    FROM all_products a
    LEFT JOIN public.store_sections s ON s.id = a.section_id
    LEFT JOIN public.store_categories c ON c.id = a.category_id
  ),
  visible AS (
    SELECT *
    FROM enriched
    WHERE reason IS NULL
  )
  SELECT jsonb_build_object(
    'section_counts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('section_id', section_id, 'total', total))
      FROM (
        SELECT section_id, count(*) AS total
        FROM visible
        WHERE section_id IS NOT NULL
        GROUP BY section_id
      ) q
    ), '[]'::jsonb),
    'category_counts', coalesce((
      SELECT jsonb_agg(jsonb_build_object('category_id', category_id, 'total', total))
      FROM (
        SELECT category_id, count(*) AS total
        FROM visible
        WHERE category_id IS NOT NULL
        GROUP BY category_id
      ) q
    ), '[]'::jsonb),
    'hidden', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'origem', origem,
        'seller_name', seller_name,
        'status', status,
        'section_name', section_name,
        'category_name', category_name,
        'reason', reason,
        'can_reactivate', reason IN ('Oculto pelo parceiro', 'Oculto pelo profissional')
      ) ORDER BY origem, seller_name, name)
      FROM enriched
      WHERE reason IS NOT NULL
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.store_admin_shelf_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_admin_shelf_report() TO authenticated;

UPDATE public.partner_products
SET is_active_by_partner = true
WHERE id = 'a104f4ee-fe86-4e56-86ac-ecf5398b50ff'
  AND status = 'approved'
  AND is_ready_for_sale = true
  AND deleted_at IS NULL
  AND is_active_by_partner = false;