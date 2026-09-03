REVOKE ALL ON FUNCTION public.admin_blocked_commissions(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_blocked_commissions(uuid, uuid) TO service_role;