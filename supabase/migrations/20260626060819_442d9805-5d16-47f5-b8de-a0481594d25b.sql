
-- Test Mode: timestamp de corte para esconder vendas/lançamentos antigos durante testes
INSERT INTO public.app_settings (key, value, description)
VALUES
  ('test_mode_enabled', 'false', 'Quando true, esconde vendas/lançamentos anteriores a test_mode_cutoff_at dos relatórios admin'),
  ('test_mode_cutoff_at', '', 'Timestamp ISO. Lançamentos com created_at < este valor ficam ocultos enquanto test_mode_enabled=true')
ON CONFLICT (key) DO NOTHING;

-- Helper SQL: retorna o cutoff ativo, ou null se modo desligado
CREATE OR REPLACE FUNCTION public.test_mode_cutoff()
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT value FROM public.app_settings WHERE key='test_mode_enabled') = 'true'
      THEN NULLIF((SELECT value FROM public.app_settings WHERE key='test_mode_cutoff_at'), '')::timestamptz
    ELSE NULL
  END
$$;

GRANT EXECUTE ON FUNCTION public.test_mode_cutoff() TO authenticated, anon, service_role;
