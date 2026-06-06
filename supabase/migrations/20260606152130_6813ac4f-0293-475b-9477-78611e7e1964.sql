REVOKE EXECUTE ON FUNCTION public.partner_preview_coupon(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.partner_preview_coupon(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.partner_preview_coupon(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_preview_coupon(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.partner_redeem_coupon(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.partner_redeem_coupon(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.partner_redeem_coupon(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.partner_redeem_coupon(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) TO service_role;