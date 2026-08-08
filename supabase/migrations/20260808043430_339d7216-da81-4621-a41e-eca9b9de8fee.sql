CREATE OR REPLACE FUNCTION public.cadeia_coaches_do_perfil(_profile_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_chain uuid[] := ARRAY[]::uuid[];
  v_cur uuid;
  v_i int := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN v_chain; END IF;

  SELECT c.id INTO v_cur FROM public.coaches c WHERE c.profile_id = _profile_id LIMIT 1;

  IF v_cur IS NULL THEN
    SELECT s.coach_id INTO v_cur FROM public.students s
      WHERE s.profile_id = _profile_id AND s.coach_id IS NOT NULL
      ORDER BY s.created_at LIMIT 1;
  END IF;

  IF v_cur IS NULL THEN
    SELECT p.upline_coach_id INTO v_cur FROM public.partners p
      WHERE p.profile_id = _profile_id AND p.upline_coach_id IS NOT NULL
      ORDER BY p.created_at LIMIT 1;
  END IF;

  WHILE v_cur IS NOT NULL AND v_i < 20 LOOP
    IF v_cur = ANY (v_chain) THEN EXIT; END IF;
    v_chain := v_chain || v_cur;
    v_i := v_i + 1;
    SELECT c.upline_coach_id INTO v_cur FROM public.coaches c WHERE c.id = v_cur;
  END LOOP;

  RETURN v_chain;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cadeia_coaches_do_perfil(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.minha_cadeia_coaches()
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.cadeia_coaches_do_perfil((SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid() LIMIT 1));
$function$;

GRANT EXECUTE ON FUNCTION public.minha_cadeia_coaches() TO authenticated;

CREATE OR REPLACE FUNCTION public.resolver_modulos(_profile_id uuid)
RETURNS TABLE(module_key text, enabled boolean, source text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_ids uuid[];
  v_theme text;
  v_chain uuid[] := ARRAY[]::uuid[];
BEGIN
  IF _profile_id IS NULL THEN
    RETURN QUERY SELECT ms.module_key, ms.enabled, 'global'::text
      FROM public.module_settings ms WHERE ms.scope_type = 'global';
    RETURN;
  END IF;

  SELECT array_agg(p.id) INTO v_partner_ids FROM public.partners p WHERE p.profile_id = _profile_id;
  v_chain := public.cadeia_coaches_do_perfil(_profile_id);

  IF array_length(v_chain, 1) > 0 THEN
    SELECT c.brand_theme_key INTO v_theme FROM public.coaches c
      WHERE c.id = v_chain[1] AND c.brand_theme_key IS NOT NULL;
  END IF;

  RETURN QUERY
  WITH candidatos AS (
    SELECT ms.module_key, ms.enabled,
           CASE ms.scope_type
             WHEN 'profile' THEN 1
             WHEN 'coach' THEN 2 + COALESCE(array_position(v_chain, ms.scope_id::uuid), 99)
             WHEN 'partner' THEN 2
             WHEN 'theme' THEN 500
             ELSE 1000
           END AS prioridade,
           ms.scope_type::text AS src
    FROM public.module_settings ms
    WHERE (ms.scope_type = 'profile' AND ms.scope_id = _profile_id::text)
       OR (ms.scope_type = 'coach' AND ms.scope_id IS NOT NULL AND ms.scope_id::uuid = ANY (v_chain))
       OR (ms.scope_type = 'partner' AND v_partner_ids IS NOT NULL AND ms.scope_id IS NOT NULL AND ms.scope_id::uuid = ANY (v_partner_ids))
       OR (ms.scope_type = 'theme' AND v_theme IS NOT NULL AND ms.scope_id = v_theme)
       OR (ms.scope_type = 'global')
  )
  SELECT DISTINCT ON (c.module_key) c.module_key, c.enabled, c.src
  FROM candidatos c
  ORDER BY c.module_key, c.prioridade;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolver_modulos(uuid) TO authenticated;