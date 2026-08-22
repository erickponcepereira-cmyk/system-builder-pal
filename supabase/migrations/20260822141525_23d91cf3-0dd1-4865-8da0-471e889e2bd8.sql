CREATE OR REPLACE FUNCTION public.parceiro_publico(p_partner_id uuid)
RETURNS TABLE (
  id uuid,
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
  business_area text,
  specialty text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id,
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
         p.business_area::text,
         p.specialty::text
  FROM public.partners p
  WHERE p.id = p_partner_id
    AND p.status = 'approved'
$$;

REVOKE ALL ON FUNCTION public.parceiro_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parceiro_publico(uuid) TO anon, authenticated, service_role;