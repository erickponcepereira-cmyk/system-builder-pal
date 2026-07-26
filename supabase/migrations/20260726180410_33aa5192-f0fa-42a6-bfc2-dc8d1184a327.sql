CREATE OR REPLACE FUNCTION public.ensure_partner_share_code() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.entity_share_codes (owner_type, owner_id, code)
  VALUES ('partner', NEW.id, public.generate_entity_share_code())
  ON CONFLICT (owner_type, owner_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.ensure_coach_share_code() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.entity_share_codes (owner_type, owner_id, code)
  VALUES ('professional', NEW.id, public.generate_entity_share_code())
  ON CONFLICT (owner_type, owner_id) DO NOTHING;
  RETURN NEW;
END; $$;

INSERT INTO public.entity_share_codes (owner_type, owner_id, code)
SELECT 'partner', id, public.generate_entity_share_code() FROM public.partners
ON CONFLICT DO NOTHING;

INSERT INTO public.entity_share_codes (owner_type, owner_id, code)
SELECT 'professional', id, public.generate_entity_share_code() FROM public.coaches
ON CONFLICT DO NOTHING;