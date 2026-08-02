DO $$
DECLARE r record; d text;
BEGIN
  FOR r IN SELECT oid FROM pg_proc WHERE pronamespace='public'::regnamespace AND prosrc LIKE '%Sao_Paulo%' LOOP
    d := replace(pg_get_functiondef(r.oid), 'America/Sao_Paulo', 'America/Cuiaba');
    EXECUTE d;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public.create_scheduled_professional_order(uuid, timestamp with time zone, text, uuid);