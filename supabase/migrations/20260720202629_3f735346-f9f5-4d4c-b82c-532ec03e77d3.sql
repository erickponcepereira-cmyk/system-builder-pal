REVOKE EXECUTE ON FUNCTION public.create_partner_company_order(uuid, uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_partner_company_order(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_partner_product_order(uuid, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_partner_product_order(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_scheduled_professional_order(uuid, timestamptz, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_scheduled_professional_order(uuid, timestamptz, text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_partner_company_order(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_company_order(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_product_order(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_product_order(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_scheduled_professional_order(uuid, timestamptz, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_scheduled_professional_order(uuid, timestamptz, text, uuid) TO authenticated;