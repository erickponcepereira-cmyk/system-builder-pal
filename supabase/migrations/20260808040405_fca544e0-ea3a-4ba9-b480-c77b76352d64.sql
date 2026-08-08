ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS restrict_to_networks boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_coach_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS perk_card_days_override integer,
  ADD COLUMN IF NOT EXISTS perk_challenge_tickets_override integer;

ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS restrict_to_networks boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allowed_coach_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS perk_card_days_override integer,
  ADD COLUMN IF NOT EXISTS perk_challenge_tickets_override integer;

-- ============ Perks com override manual por produto ============
CREATE OR REPLACE FUNCTION public.grant_partner_product_perks(_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  v_card_days int := 0;
  v_tickets int := 0;
  v_points int;
  v_paid_at timestamptz;
  v_i int;
  v_product_id uuid;
  v_grants_perks boolean := false;
  v_price numeric := 0;
  v_days_override int;
  v_tickets_override int;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id;
  IF o.id IS NULL OR o.status <> 'paid' THEN RETURN; END IF;

  v_paid_at := COALESCE(o.paid_at, now());
  v_product_id := COALESCE(o.partner_product_id, o.professional_product_id);

  IF o.professional_product_id IS NOT NULL THEN
    SELECT COALESCE(grants_subscription_perks, false), COALESCE(price, 0),
           perk_card_days_override, perk_challenge_tickets_override
      INTO v_grants_perks, v_price, v_days_override, v_tickets_override
      FROM public.professional_products
     WHERE id = o.professional_product_id;
  ELSIF o.partner_product_id IS NOT NULL THEN
    SELECT COALESCE(grants_subscription_perks, false), COALESCE(price, 0),
           perk_card_days_override, perk_challenge_tickets_override
      INTO v_grants_perks, v_price, v_days_override, v_tickets_override
      FROM public.partner_products
     WHERE id = o.partner_product_id;
  END IF;

  IF COALESCE(v_grants_perks, false) THEN
    v_card_days := 30;
    v_tickets := 1;
  ELSE
    SELECT b.card_days, b.challenge_tickets
      INTO v_card_days, v_tickets
      FROM public.compute_partner_product_benefits(GREATEST(COALESCE(o.gross_amount, 0), v_price)) b;
  END IF;

  -- Override manual definido no admin tem prioridade sobre qualquer regra.
  IF v_days_override IS NOT NULL THEN v_card_days := v_days_override; END IF;
  IF v_tickets_override IS NOT NULL THEN v_tickets := v_tickets_override; END IF;

  v_card_days := COALESCE(v_card_days, 0);
  v_tickets := COALESCE(v_tickets, 0);

  IF v_card_days > 0 AND o.student_id IS NOT NULL
     AND COALESCE((o.metadata->>'perks_card_days')::int, 0) = 0 THEN
    UPDATE public.students s
       SET card_valid_until = GREATEST(COALESCE(s.card_valid_until, CURRENT_DATE), CURRENT_DATE) + (v_card_days || ' days')::interval
     WHERE s.id = o.student_id;
  END IF;

  IF v_tickets > 0 AND o.student_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.student_challenge_tokens t
                      WHERE t.student_id = o.student_id
                        AND t.notes = 'partner_order:' || o.id::text) THEN
    FOR v_i IN 1..v_tickets LOOP
      INSERT INTO public.student_challenge_tokens (student_id, source_product_id, granted_by, granted_at, notes, created_at)
      VALUES (o.student_id, v_product_id, 'partner_product_purchase', v_paid_at, 'partner_order:' || o.id::text, v_paid_at);
    END LOOP;
  END IF;

  v_points := public.compute_system_fee_points(COALESCE(o.system_fee, 0));
  IF v_points > 0 AND o.selling_coach_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.coach_points_log cpl
                      WHERE cpl.coach_id = o.selling_coach_id
                        AND cpl.metadata->>'partner_order_id' = o.id::text) THEN
    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata, created_at)
    VALUES (o.selling_coach_id, NULL, NULL, v_points,
            'Taxa de sistema (parceiro/profissional)',
            jsonb_build_object(
              'partner_order_id', o.id,
              'system_fee', o.system_fee,
              'partner_product_id', o.partner_product_id,
              'professional_product_id', o.professional_product_id
            ),
            v_paid_at);
  END IF;

  UPDATE public.partner_product_orders
     SET metadata = COALESCE(metadata,'{}'::jsonb)
                    || jsonb_build_object(
                         'perks_granted', true,
                         'perks_card_days', v_card_days,
                         'perks_tickets', v_tickets,
                         'perks_career_points', v_points
                       )
   WHERE id = _order_id;
END;
$function$;

-- ============ Bloqueio de compra fora da rede autorizada ============
CREATE OR REPLACE FUNCTION public.enforce_product_network_restriction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_restrict boolean := false;
  v_allowed uuid[] := '{}'::uuid[];
  v_coach uuid;
BEGIN
  IF NEW.partner_product_id IS NOT NULL THEN
    SELECT COALESCE(restrict_to_networks,false), COALESCE(allowed_coach_ids,'{}'::uuid[])
      INTO v_restrict, v_allowed
      FROM public.partner_products WHERE id = NEW.partner_product_id;
  ELSIF NEW.professional_product_id IS NOT NULL THEN
    SELECT COALESCE(restrict_to_networks,false), COALESCE(allowed_coach_ids,'{}'::uuid[])
      INTO v_restrict, v_allowed
      FROM public.professional_products WHERE id = NEW.professional_product_id;
  END IF;

  IF COALESCE(v_restrict, false) THEN
    SELECT s.coach_id INTO v_coach FROM public.students s WHERE s.id = NEW.student_id;
    IF v_coach IS NULL OR NOT (v_coach = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'Este produto está disponível apenas para alunos da rede autorizada.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ppo_network_restriction ON public.partner_product_orders;
CREATE TRIGGER trg_ppo_network_restriction
  BEFORE INSERT ON public.partner_product_orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_network_restriction();

-- ============ Catálogo público ciente do coach da indicação ============
DROP FUNCTION IF EXISTS public.catalogo_publico_produto(uuid);
CREATE OR REPLACE FUNCTION public.catalogo_publico_produto(_id uuid, _coach_id uuid DEFAULT NULL)
 RETURNS TABLE(id uuid, fonte text, tipo text, nome text, subtitulo text, descricao text, preco numeric, preco_original numeric, imagem_url text, secao_id uuid, categoria_id uuid, subcategoria_id uuid, badge text, estoque numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
  SELECT
    p.id, 'fitmind'::text, COALESCE(p.kind::text, 'store'), p.name, p.subtitle,
    COALESCE(p.short_description, p.description), p.price, p.original_price, p.image_url,
    p.section_id, p.category_id, p.subcategory_id, p.badge_label, p.stock::numeric
  FROM public.products p
  WHERE p.id = _id
    AND ((p.kind IS NULL AND p.status = 'active') OR (p.kind IS NOT NULL AND p.is_active = true))

  UNION ALL

  SELECT
    pp.id, 'partner'::text, 'partner'::text, pp.name, NULL::text, pp.description,
    pp.price, pp.original_price, pp.image_url, pp.section_id, pp.category_id,
    pp.subcategory_id, NULL::text, pp.stock::numeric
  FROM public.partner_products pp
  WHERE pp.id = _id
    AND pp.status = 'approved'
    AND (NOT COALESCE(pp.restrict_to_networks,false)
         OR (_coach_id IS NOT NULL AND _coach_id = ANY (COALESCE(pp.allowed_coach_ids,'{}'::uuid[]))))

  UNION ALL

  SELECT
    pr.id, 'professional'::text, 'professional'::text, pr.name, NULL::text, pr.description,
    pr.price, pr.original_price, pr.image_url, pr.section_id, pr.category_id,
    pr.subcategory_id, NULL::text, pr.stock::numeric
  FROM public.professional_products pr
  WHERE pr.id = _id
    AND pr.status = 'approved'
    AND pr.is_active_by_professional = true
    AND (NOT COALESCE(pr.restrict_to_networks,false)
         OR (_coach_id IS NOT NULL AND _coach_id = ANY (COALESCE(pr.allowed_coach_ids,'{}'::uuid[]))))

  LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.catalogo_publico_produto(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogo_publico_produto(uuid, uuid) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_product_network_restriction() FROM PUBLIC;