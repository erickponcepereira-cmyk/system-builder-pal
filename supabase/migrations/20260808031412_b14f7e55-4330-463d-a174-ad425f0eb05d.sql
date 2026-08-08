
CREATE TABLE public.module_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('global','theme','partner','coach','profile')),
  scope_id text,
  module_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX module_settings_scope_uniq ON public.module_settings (scope_type, coalesce(scope_id,''), module_key);

GRANT SELECT ON public.module_settings TO authenticated;
GRANT ALL ON public.module_settings TO service_role;
ALTER TABLE public.module_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "module_settings_read" ON public.module_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "module_settings_admin_all" ON public.module_settings FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

CREATE TABLE public.run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  run_date date NOT NULL,
  distance_km numeric(8,3) NOT NULL CHECK (distance_km > 0),
  duration_seconds integer NOT NULL CHECK (duration_seconds > 0),
  pace_seconds integer NOT NULL CHECK (pace_seconds > 0),
  activity_type text NOT NULL DEFAULT 'corrida_rua',
  is_race boolean NOT NULL DEFAULT false,
  race_name text,
  location text,
  notes text,
  photo_url text,
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  external_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX run_logs_profile_date_idx ON public.run_logs (profile_id, run_date DESC);
CREATE UNIQUE INDEX run_logs_source_external_uniq ON public.run_logs (source, external_id) WHERE external_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_logs TO authenticated;
GRANT ALL ON public.run_logs TO service_role;
ALTER TABLE public.run_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "run_logs_owner_all" ON public.run_logs FOR ALL TO authenticated
  USING (profile_id = public.current_profile_id())
  WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY "run_logs_admin_read" ON public.run_logs FOR SELECT TO authenticated
  USING (public.current_user_is_admin());

CREATE POLICY "run_logs_coach_read" ON public.run_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.profile_id = run_logs.profile_id
      AND s.coach_id = ANY (public.current_user_coach_ids())
  ));

CREATE TRIGGER trg_run_logs_updated_at BEFORE UPDATE ON public.run_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_module_settings_updated_at BEFORE UPDATE ON public.module_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resolve os módulos liberados para um perfil, do escopo mais específico ao mais genérico.
CREATE OR REPLACE FUNCTION public.resolver_modulos(_profile_id uuid)
RETURNS TABLE (module_key text, enabled boolean, source text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
  v_partner_ids uuid[];
  v_theme text;
  v_chain uuid[] := ARRAY[]::uuid[];
  v_cur uuid;
  v_i int := 0;
BEGIN
  IF _profile_id IS NULL THEN
    RETURN QUERY SELECT ms.module_key, ms.enabled, 'global'::text
      FROM public.module_settings ms WHERE ms.scope_type = 'global';
    RETURN;
  END IF;

  SELECT c.id INTO v_coach_id FROM public.coaches c WHERE c.profile_id = _profile_id LIMIT 1;

  SELECT array_agg(p.id) INTO v_partner_ids FROM public.partners p WHERE p.profile_id = _profile_id;

  -- cadeia de rede: coach próprio (se houver) ou coach do aluno, subindo pelas uplines
  IF v_coach_id IS NOT NULL THEN
    v_cur := v_coach_id;
  ELSE
    SELECT s.coach_id INTO v_cur FROM public.students s
      WHERE s.profile_id = _profile_id AND s.coach_id IS NOT NULL
      ORDER BY s.created_at LIMIT 1;
  END IF;

  WHILE v_cur IS NOT NULL AND v_i < 20 LOOP
    IF v_cur = ANY (v_chain) THEN EXIT; END IF;
    v_chain := v_chain || v_cur;
    v_i := v_i + 1;
    SELECT c.upline_coach_id INTO v_cur FROM public.coaches c WHERE c.id = v_cur;
  END LOOP;

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
$$;

REVOKE ALL ON FUNCTION public.resolver_modulos(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolver_modulos(uuid) TO authenticated, service_role;

-- Estatísticas de corrida do próprio usuário
CREATE OR REPLACE FUNCTION public.run_stats(_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_mes_top record;
BEGIN
  SELECT to_char(date_trunc('month', r.run_date), 'YYYY-MM') AS mes, sum(r.distance_km) AS km
    INTO v_mes_top
    FROM public.run_logs r WHERE r.profile_id = _profile_id
    GROUP BY 1 ORDER BY 2 DESC LIMIT 1;

  SELECT jsonb_build_object(
    'total_km', COALESCE(sum(r.distance_km), 0),
    'best_pace', MIN(r.pace_seconds),
    'avg_pace', CASE WHEN sum(r.distance_km) > 0
        THEN round(sum(r.duration_seconds)::numeric / sum(r.distance_km))
        ELSE NULL END,
    'km_month', COALESCE(sum(r.distance_km) FILTER (
        WHERE date_trunc('month', r.run_date) = date_trunc('month', (now() AT TIME ZONE 'America/Cuiaba')::date)), 0),
    'days_month', COUNT(DISTINCT r.run_date) FILTER (
        WHERE date_trunc('month', r.run_date) = date_trunc('month', (now() AT TIME ZONE 'America/Cuiaba')::date)),
    'races', COUNT(*) FILTER (WHERE r.is_race),
    'total_runs', COUNT(*),
    'best_month_km', COALESCE(v_mes_top.km, 0),
    'best_month', v_mes_top.mes
  ) INTO v_result
  FROM public.run_logs r WHERE r.profile_id = _profile_id;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.run_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_stats(uuid) TO authenticated, service_role;

-- Padrão FitMind
INSERT INTO public.module_settings (scope_type, scope_id, module_key, enabled) VALUES
  ('global', NULL, 'nutricao', true),
  ('global', NULL, 'corrida', false),
  ('global', NULL, 'treinos', true),
  ('global', NULL, 'mentalidade', true),
  ('global', NULL, 'beneficios', true),
  ('global', NULL, 'avaliacao_fisica', true);

-- Corrida liberada para a rede da Carol Aventureira
INSERT INTO public.module_settings (scope_type, scope_id, module_key, enabled)
SELECT 'coach', c.id::text, 'corrida', true
FROM public.coaches c
JOIN public.profiles p ON p.id = c.profile_id
WHERE p.email ILIKE 'carolheming25@gmail.com';
