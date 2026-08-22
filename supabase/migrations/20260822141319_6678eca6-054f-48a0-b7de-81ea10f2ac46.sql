CREATE OR REPLACE FUNCTION public.parceiro_do_dono(p_partner_id uuid)
RETURNS TABLE (
  id uuid,
  profile_id uuid,
  fantasy_name text,
  description text,
  photo_url text,
  cover_url text,
  whatsapp text,
  public_whatsapp text,
  instagram text,
  facebook text,
  website text,
  address text,
  city text,
  state text,
  status text,
  document text,
  document_type text,
  business_area text,
  specialty text,
  referral_code text,
  referral_link text,
  free_redeem_policy text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id,
         p.profile_id,
         p.fantasy_name::text,
         p.description::text,
         p.photo_url::text,
         p.cover_url::text,
         p.whatsapp::text,
         p.public_whatsapp::text,
         p.instagram::text,
         p.facebook::text,
         p.website::text,
         p.address::text,
         p.city::text,
         p.state::text,
         p.status::text,
         p.document::text,
         p.document_type::text,
         p.business_area::text,
         p.specialty::text,
         p.referral_code::text,
         p.referral_link::text,
         p.free_redeem_policy::text
  FROM public.partners p
  WHERE p.id = p_partner_id
    AND (
      public.is_admin(auth.uid())
      OR p.profile_id = public.current_profile_id()
      OR public.partner_pode(p.id, 'profile.editar')
      OR public.partner_pode(p.id, 'overview.ver')
    )
$$;

REVOKE ALL ON FUNCTION public.parceiro_do_dono(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parceiro_do_dono(uuid) TO authenticated, service_role;