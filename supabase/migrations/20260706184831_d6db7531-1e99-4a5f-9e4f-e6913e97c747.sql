REVOKE EXECUTE ON FUNCTION public.coach_assessment_counts(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.coach_assessment_counts(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.coach_assessment_counts(uuid, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.coach_evaluation_client_summaries(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.coach_evaluation_client_summaries(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.coach_evaluation_client_summaries(uuid) TO authenticated;