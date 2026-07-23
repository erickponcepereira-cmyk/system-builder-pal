REVOKE EXECUTE ON FUNCTION public.list_partner_freebie_slots(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_partner_freebie_slots(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.list_partner_freebie_slots(uuid, timestamptz, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reserve_partner_freebie(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reserve_partner_freebie(uuid, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.reserve_partner_freebie(uuid, timestamptz) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_partner_freebie(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_partner_freebie(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_partner_freebie(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.redeem_partner_freebie(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.redeem_partner_freebie(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.redeem_partner_freebie(text) TO authenticated;