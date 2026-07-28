-- 1) allow multiple partner units per profile
ALTER TABLE public.partners DROP CONSTRAINT IF EXISTS partners_profile_id_key;
CREATE INDEX IF NOT EXISTS idx_partners_profile_id ON public.partners(profile_id);

-- 2) new unit => owner membership + wallet
CREATE OR REPLACE FUNCTION public.bootstrap_partner_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.partner_members (partner_id, profile_id, papel, permissoes)
  VALUES (NEW.id, NEW.profile_id, 'owner', ARRAY[]::text[])
  ON CONFLICT (partner_id, profile_id) DO NOTHING;

  INSERT INTO public.partner_wallets (partner_id)
  VALUES (NEW.id)
  ON CONFLICT (partner_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bootstrap_partner_unit ON public.partners;
CREATE TRIGGER trg_bootstrap_partner_unit
AFTER INSERT ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_partner_unit();

-- 3) backfill wallets / owner rows for existing units
INSERT INTO public.partner_wallets (partner_id)
SELECT p.id FROM public.partners p
WHERE NOT EXISTS (SELECT 1 FROM public.partner_wallets w WHERE w.partner_id = p.id);

INSERT INTO public.partner_members (partner_id, profile_id, papel, permissoes)
SELECT p.id, p.profile_id, 'owner', ARRAY[]::text[]
FROM public.partners p
WHERE NOT EXISTS (
  SELECT 1 FROM public.partner_members m
  WHERE m.partner_id = p.id AND m.profile_id = p.profile_id
);