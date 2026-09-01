CREATE OR REPLACE FUNCTION public.wallet_statement_bulk(_profile_ids uuid[])
RETURNS TABLE (profile_id uuid, statement jsonb)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT pid, public.wallet_statement(pid, false)
  FROM unnest(COALESCE(_profile_ids, '{}'::uuid[])) AS pid;
$$;

REVOKE ALL ON FUNCTION public.wallet_statement_bulk(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_statement_bulk(uuid[]) TO service_role;