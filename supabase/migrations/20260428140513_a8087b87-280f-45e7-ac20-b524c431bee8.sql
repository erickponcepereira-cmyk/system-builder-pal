ALTER FUNCTION public.refresh_coach_inactivity() SECURITY INVOKER;
ALTER FUNCTION public.extend_coach_inactivity_grace(UUID, INTEGER, TEXT) SECURITY INVOKER;
ALTER FUNCTION public.block_inactive_coach(UUID, TEXT) SECURITY INVOKER;
ALTER FUNCTION public.transfer_inactive_coach_network(UUID, UUID, TEXT) SECURITY INVOKER;

REVOKE EXECUTE ON FUNCTION public.refresh_coach_inactivity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.extend_coach_inactivity_grace(UUID, INTEGER, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.block_inactive_coach(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.transfer_inactive_coach_network(UUID, UUID, TEXT) FROM anon;

GRANT EXECUTE ON FUNCTION public.refresh_coach_inactivity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_coach_inactivity_grace(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_inactive_coach(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_inactive_coach_network(UUID, UUID, TEXT) TO authenticated;