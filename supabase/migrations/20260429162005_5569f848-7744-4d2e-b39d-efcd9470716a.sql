REVOKE EXECUTE ON FUNCTION public.get_or_create_daily_quote() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enqueue_daily_student_reminders() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_coach_course_module_complete(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_coach_application(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.review_coach_application(UUID, TEXT, TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_or_create_daily_quote() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_daily_student_reminders() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_coach_course_module_complete(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_coach_application(TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_coach_application(UUID, TEXT, TEXT) TO authenticated;