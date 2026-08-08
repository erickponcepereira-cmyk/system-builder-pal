CREATE OR REPLACE FUNCTION public.enforce_product_network_restriction()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_restrict boolean := false;
  v_allowed uuid[] := '{}'::uuid[];
  v_owner_coach uuid;
  v_profile uuid;
  v_chain uuid[] := '{}'::uuid[];
BEGIN
  IF NEW.partner_product_id IS NOT NULL THEN
    SELECT COALESCE(restrict_to_networks,false), COALESCE(allowed_coach_ids,'{}'::uuid[])
      INTO v_restrict, v_allowed
      FROM public.partner_products WHERE id = NEW.partner_product_id;
  ELSIF NEW.professional_product_id IS NOT NULL THEN
    SELECT COALESCE(restrict_to_networks,false), COALESCE(allowed_coach_ids,'{}'::uuid[]), coach_id
      INTO v_restrict, v_allowed, v_owner_coach
      FROM public.professional_products WHERE id = NEW.professional_product_id;
  END IF;

  IF NOT COALESCE(v_restrict, false) THEN
    RETURN NEW;
  END IF;

  -- admin nunca é barrado
  IF public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN NEW;
  END IF;

  SELECT s.profile_id INTO v_profile FROM public.students s WHERE s.id = NEW.student_id;
  v_chain := public.cadeia_coaches_do_perfil(v_profile);

  -- a cadeia começa no próprio coach quando o comprador é coach, então
  -- isso cobre o dono do produto e toda a rede abaixo dos coaches autorizados
  IF v_chain && v_allowed THEN
    RETURN NEW;
  END IF;

  IF v_owner_coach IS NOT NULL AND v_owner_coach = ANY (v_chain) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Este produto está disponível apenas para alunos da rede autorizada.';
END;
$function$;