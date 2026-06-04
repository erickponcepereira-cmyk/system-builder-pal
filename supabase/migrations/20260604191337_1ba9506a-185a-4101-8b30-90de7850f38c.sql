REVOKE EXECUTE ON FUNCTION public.admin_change_student_coach(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_change_student_coach(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_change_student_coach(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.sync_profile_upline_from_student_coach() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_profile_upline_from_student_coach() FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_profile_upline_from_student_coach() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sync_profile_upline_from_student_coach() TO service_role;

REVOKE EXECUTE ON FUNCTION public.apply_student_coach_to_new_panel() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_student_coach_to_new_panel() FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_student_coach_to_new_panel() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_student_coach_to_new_panel() TO service_role;