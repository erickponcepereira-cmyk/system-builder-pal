REVOKE EXECUTE ON FUNCTION public.refresh_coach_inactivity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.extend_coach_inactivity_grace(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.block_inactive_coach(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transfer_inactive_coach_network(UUID, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.refresh_coach_inactivity() TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_coach_inactivity_grace(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_inactive_coach(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_inactive_coach_network(UUID, UUID, TEXT) TO authenticated;