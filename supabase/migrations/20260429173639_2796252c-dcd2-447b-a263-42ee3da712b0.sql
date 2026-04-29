REVOKE EXECUTE ON FUNCTION public.submit_coach_application(text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_coach_application(text, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_coach_application(text, text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_coach_application(text, text, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_coach_application(text, text, text, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_coach_application(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.review_coach_application(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.review_coach_application(uuid, text, text) TO authenticated;