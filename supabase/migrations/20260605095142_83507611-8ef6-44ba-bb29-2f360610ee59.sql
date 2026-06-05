REVOKE EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) TO service_role;