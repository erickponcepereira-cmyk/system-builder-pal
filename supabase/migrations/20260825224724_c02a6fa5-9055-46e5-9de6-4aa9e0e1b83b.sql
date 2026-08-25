REVOKE EXECUTE ON FUNCTION public.academia_agente_retrato(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.academia_agente_retrato(uuid, text) TO anon, service_role;