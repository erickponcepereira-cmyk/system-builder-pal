REVOKE EXECUTE ON FUNCTION public.partner_pode(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.current_partner_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.minhas_unidades_parceiro() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_partner_members_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_pode(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_partner_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.minhas_unidades_parceiro() TO authenticated, service_role;