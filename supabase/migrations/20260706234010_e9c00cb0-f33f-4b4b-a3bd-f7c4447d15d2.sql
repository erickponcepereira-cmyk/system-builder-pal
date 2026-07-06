
-- 1) entity_share_codes
CREATE TABLE public.entity_share_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('partner','professional')),
  owner_id uuid NOT NULL,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_type, owner_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entity_share_codes TO authenticated;
GRANT ALL ON public.entity_share_codes TO service_role;
ALTER TABLE public.entity_share_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "share codes readable by authenticated"
  ON public.entity_share_codes FOR SELECT TO authenticated USING (true);
CREATE POLICY "share codes owner manage"
  ON public.entity_share_codes FOR ALL TO authenticated
  USING (
    (owner_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = owner_id AND p.profile_id = auth.uid()))
    OR (owner_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = owner_id AND c.profile_id = auth.uid()))
  )
  WITH CHECK (
    (owner_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = owner_id AND p.profile_id = auth.uid()))
    OR (owner_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = owner_id AND c.profile_id = auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.generate_entity_share_code() RETURNS text
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; result text; i int; c int;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..8 LOOP result := result || substr(chars, floor(random() * length(chars))::int + 1, 1); END LOOP;
    SELECT count(*) INTO c FROM public.entity_share_codes WHERE code = result;
    EXIT WHEN c = 0;
  END LOOP;
  RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.ensure_partner_share_code() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.entity_share_codes (owner_type, owner_id, code)
  VALUES ('partner', NEW.id, public.generate_entity_share_code())
  ON CONFLICT (owner_type, owner_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.ensure_coach_share_code() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.entity_share_codes (owner_type, owner_id, code)
  VALUES ('professional', NEW.id, public.generate_entity_share_code())
  ON CONFLICT (owner_type, owner_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_partners_share_code AFTER INSERT ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.ensure_partner_share_code();
CREATE TRIGGER trg_coaches_share_code AFTER INSERT ON public.coaches
  FOR EACH ROW EXECUTE FUNCTION public.ensure_coach_share_code();

INSERT INTO public.entity_share_codes (owner_type, owner_id, code)
SELECT 'partner', id, public.generate_entity_share_code() FROM public.partners
ON CONFLICT DO NOTHING;
INSERT INTO public.entity_share_codes (owner_type, owner_id, code)
SELECT 'professional', id, public.generate_entity_share_code() FROM public.coaches
ON CONFLICT DO NOTHING;

-- 2) calendar_shares
CREATE TABLE public.calendar_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('partner','professional')),
  owner_id uuid NOT NULL,
  viewer_type text NOT NULL CHECK (viewer_type IN ('partner','professional')),
  viewer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','rejected')),
  requested_by text NOT NULL DEFAULT 'viewer' CHECK (requested_by IN ('viewer','owner')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (owner_type, owner_id, viewer_type, viewer_id)
);
CREATE INDEX idx_calendar_shares_owner ON public.calendar_shares (owner_type, owner_id, status);
CREATE INDEX idx_calendar_shares_viewer ON public.calendar_shares (viewer_type, viewer_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_shares TO authenticated;
GRANT ALL ON public.calendar_shares TO service_role;
ALTER TABLE public.calendar_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cshares read"
  ON public.calendar_shares FOR SELECT TO authenticated
  USING (
    (owner_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = owner_id AND p.profile_id = auth.uid()))
    OR (owner_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = owner_id AND c.profile_id = auth.uid()))
    OR (viewer_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = viewer_id AND p.profile_id = auth.uid()))
    OR (viewer_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = viewer_id AND c.profile_id = auth.uid()))
  );
CREATE POLICY "cshares insert viewer"
  ON public.calendar_shares FOR INSERT TO authenticated
  WITH CHECK (
    (viewer_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = viewer_id AND p.profile_id = auth.uid()))
    OR (viewer_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = viewer_id AND c.profile_id = auth.uid()))
  );
CREATE POLICY "cshares update owner"
  ON public.calendar_shares FOR UPDATE TO authenticated
  USING (
    (owner_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = owner_id AND p.profile_id = auth.uid()))
    OR (owner_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = owner_id AND c.profile_id = auth.uid()))
  );
CREATE POLICY "cshares delete either"
  ON public.calendar_shares FOR DELETE TO authenticated
  USING (
    (owner_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = owner_id AND p.profile_id = auth.uid()))
    OR (owner_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = owner_id AND c.profile_id = auth.uid()))
    OR (viewer_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = viewer_id AND p.profile_id = auth.uid()))
    OR (viewer_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = viewer_id AND c.profile_id = auth.uid()))
  );

-- 3) external_appointments
CREATE TABLE public.external_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('partner','professional')),
  owner_id uuid NOT NULL,
  product_name text NOT NULL,
  client_name text NOT NULL,
  client_whatsapp text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_external_appt_owner_time ON public.external_appointments (owner_type, owner_id, starts_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_appointments TO authenticated;
GRANT ALL ON public.external_appointments TO service_role;
ALTER TABLE public.external_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "extappt owner manage"
  ON public.external_appointments FOR ALL TO authenticated
  USING (
    (owner_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = owner_id AND p.profile_id = auth.uid()))
    OR (owner_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = owner_id AND c.profile_id = auth.uid()))
  )
  WITH CHECK (
    (owner_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = owner_id AND p.profile_id = auth.uid()))
    OR (owner_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = owner_id AND c.profile_id = auth.uid()))
  );

CREATE POLICY "extappt shared viewer read"
  ON public.external_appointments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.calendar_shares cs
    WHERE cs.status = 'accepted'
      AND cs.owner_type = external_appointments.owner_type
      AND cs.owner_id = external_appointments.owner_id
      AND (
        (cs.viewer_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = cs.viewer_id AND p.profile_id = auth.uid()))
        OR (cs.viewer_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = cs.viewer_id AND c.profile_id = auth.uid()))
      )
  ));

-- 4) product_coproductions
ALTER TABLE public.partner_products ADD COLUMN IF NOT EXISTS is_ready_for_sale boolean NOT NULL DEFAULT true;
ALTER TABLE public.professional_products ADD COLUMN IF NOT EXISTS is_ready_for_sale boolean NOT NULL DEFAULT true;

CREATE TABLE public.product_coproductions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type text NOT NULL CHECK (product_type IN ('partner','professional')),
  product_id uuid NOT NULL,
  creator_type text NOT NULL CHECK (creator_type IN ('partner','professional')),
  creator_id uuid NOT NULL,
  collaborator_type text NOT NULL CHECK (collaborator_type IN ('partner','professional')),
  collaborator_id uuid NOT NULL,
  fixed_amount_brl numeric(10,2) NOT NULL CHECK (fixed_amount_brl >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE INDEX idx_coprod_product ON public.product_coproductions (product_type, product_id);
CREATE INDEX idx_coprod_collab ON public.product_coproductions (collaborator_type, collaborator_id, status);
CREATE INDEX idx_coprod_creator ON public.product_coproductions (creator_type, creator_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_coproductions TO authenticated;
GRANT ALL ON public.product_coproductions TO service_role;
ALTER TABLE public.product_coproductions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coprod read"
  ON public.product_coproductions FOR SELECT TO authenticated
  USING (
    (creator_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = creator_id AND p.profile_id = auth.uid()))
    OR (creator_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = creator_id AND c.profile_id = auth.uid()))
    OR (collaborator_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = collaborator_id AND p.profile_id = auth.uid()))
    OR (collaborator_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = collaborator_id AND c.profile_id = auth.uid()))
  );
CREATE POLICY "coprod insert creator"
  ON public.product_coproductions FOR INSERT TO authenticated
  WITH CHECK (
    (creator_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = creator_id AND p.profile_id = auth.uid()))
    OR (creator_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = creator_id AND c.profile_id = auth.uid()))
  );
CREATE POLICY "coprod update either"
  ON public.product_coproductions FOR UPDATE TO authenticated
  USING (
    (creator_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = creator_id AND p.profile_id = auth.uid()))
    OR (creator_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = creator_id AND c.profile_id = auth.uid()))
    OR (collaborator_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = collaborator_id AND p.profile_id = auth.uid()))
    OR (collaborator_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = collaborator_id AND c.profile_id = auth.uid()))
  );
CREATE POLICY "coprod delete creator"
  ON public.product_coproductions FOR DELETE TO authenticated
  USING (
    (creator_type = 'partner' AND EXISTS (SELECT 1 FROM public.partners p WHERE p.id = creator_id AND p.profile_id = auth.uid()))
    OR (creator_type = 'professional' AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.id = creator_id AND c.profile_id = auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.recompute_product_ready() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ptype text; pid uuid; pending_count int; ready boolean;
BEGIN
  ptype := COALESCE(NEW.product_type, OLD.product_type);
  pid := COALESCE(NEW.product_id, OLD.product_id);
  SELECT count(*) INTO pending_count FROM public.product_coproductions
    WHERE product_type = ptype AND product_id = pid AND status = 'pending';
  ready := pending_count = 0;
  IF ptype = 'partner' THEN
    UPDATE public.partner_products SET is_ready_for_sale = ready WHERE id = pid;
  ELSE
    UPDATE public.professional_products SET is_ready_for_sale = ready WHERE id = pid;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_coprod_ready
  AFTER INSERT OR UPDATE OR DELETE ON public.product_coproductions
  FOR EACH ROW EXECUTE FUNCTION public.recompute_product_ready();
