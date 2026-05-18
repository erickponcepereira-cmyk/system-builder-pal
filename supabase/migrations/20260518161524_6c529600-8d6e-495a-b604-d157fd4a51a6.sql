
-- 1. Add 'partner' to user_role enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'partner';

-- 2. partners table
CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  fantasy_name VARCHAR(255) NOT NULL,
  document VARCHAR(20),
  document_type VARCHAR(8) DEFAULT 'cnpj',
  photo_url TEXT,
  cover_url TEXT,
  description TEXT,
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(9),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  whatsapp VARCHAR(20),
  instagram TEXT,
  facebook TEXT,
  website TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ,
  blocked_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partners_status ON public.partners(status);

-- 3. partner_products
CREATE TABLE IF NOT EXISTS public.partner_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  kind VARCHAR(8) NOT NULL CHECK (kind IN ('free','paid')),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  image_url TEXT,
  price NUMERIC(10,2) DEFAULT 0,
  stock INTEGER,
  redemption_instructions TEXT,
  status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','inactive')),
  admin_notes TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id),
  is_active_by_partner BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_products_partner ON public.partner_products(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_products_status ON public.partner_products(status);
CREATE INDEX IF NOT EXISTS idx_partner_products_kind ON public.partner_products(kind);

-- 4. partner_posts (timeline)
CREATE TABLE IF NOT EXISTS public.partner_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_partner_posts_partner ON public.partner_posts(partner_id, created_at DESC);

-- 5. partner_visits
CREATE TABLE IF NOT EXISTS public.partner_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source VARCHAR(20) DEFAULT 'qr'
);
CREATE INDEX IF NOT EXISTS idx_partner_visits_partner ON public.partner_visits(partner_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_visits_student ON public.partner_visits(student_id, visited_at DESC);

-- 6. updated_at triggers
DROP TRIGGER IF EXISTS partners_updated_at ON public.partners;
CREATE TRIGGER partners_updated_at BEFORE UPDATE ON public.partners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS partner_products_updated_at ON public.partner_products;
CREATE TRIGGER partner_products_updated_at BEFORE UPDATE ON public.partner_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Helper: is current user the owner of partner?
CREATE OR REPLACE FUNCTION public.current_partner_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pt.id FROM public.partners pt
  JOIN public.profiles pr ON pr.id = pt.profile_id
  WHERE pr.user_id = auth.uid() LIMIT 1
$$;

-- 8. Trigger: enforce "free required" rule
CREATE OR REPLACE FUNCTION public.enforce_partner_free_required()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  has_active_free BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.partner_products
    WHERE partner_id = NEW.partner_id
      AND kind = 'free'
      AND status = 'approved'
      AND is_active_by_partner = true
  ) INTO has_active_free;

  IF NOT has_active_free THEN
    UPDATE public.partner_products
    SET status = 'inactive'
    WHERE partner_id = NEW.partner_id
      AND kind = 'paid'
      AND status = 'approved';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_products_enforce_free ON public.partner_products;
CREATE TRIGGER partner_products_enforce_free
AFTER INSERT OR UPDATE OF status, is_active_by_partner, kind ON public.partner_products
FOR EACH ROW EXECUTE FUNCTION public.enforce_partner_free_required();

-- 9. Validation: block creating new paid product when no active approved free exists
CREATE OR REPLACE FUNCTION public.validate_partner_paid_product()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.kind = 'paid' AND TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.partner_products
      WHERE partner_id = NEW.partner_id
        AND kind = 'free'
        AND status = 'approved'
        AND is_active_by_partner = true
    ) THEN
      RAISE EXCEPTION 'Crie e mantenha pelo menos 1 produto gratuito aprovado antes de cadastrar produtos pagos.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_products_validate_paid ON public.partner_products;
CREATE TRIGGER partner_products_validate_paid
BEFORE INSERT ON public.partner_products
FOR EACH ROW EXECUTE FUNCTION public.validate_partner_paid_product();

-- 10. partner_checkin function
CREATE OR REPLACE FUNCTION public.partner_checkin(_partner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  curr_student_id UUID;
  partner_name TEXT;
BEGIN
  SELECT s.id INTO curr_student_id FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid() LIMIT 1;

  IF curr_student_id IS NULL THEN
    RAISE EXCEPTION 'Apenas alunos podem fazer check-in em parceiros';
  END IF;

  SELECT fantasy_name INTO partner_name FROM public.partners
  WHERE id = _partner_id AND status = 'approved';
  IF partner_name IS NULL THEN
    RAISE EXCEPTION 'Empresa parceira não encontrada ou inativa';
  END IF;

  INSERT INTO public.partner_visits (partner_id, student_id, source)
  VALUES (_partner_id, curr_student_id, 'qr');

  INSERT INTO public.attendance_logs (student_id, log_date, attended, activity_type, notes)
  VALUES (curr_student_id, CURRENT_DATE, true, 'partner_visit', 'Visita à empresa parceira: ' || partner_name)
  ON CONFLICT (student_id, log_date, activity_type) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'partner_name', partner_name);
END;
$$;

-- 11. Update handle_new_user to also create partner row when role=partner
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_profile_id UUID;
  selected_role public.user_role;
BEGIN
  selected_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', '')::public.user_role, 'student');

  INSERT INTO public.profiles (user_id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NEW.email),
    NEW.email,
    selected_role
  )
  ON CONFLICT (user_id) DO UPDATE
  SET name = COALESCE(EXCLUDED.name, public.profiles.name),
      email = COALESCE(EXCLUDED.email, public.profiles.email),
      role = EXCLUDED.role
  RETURNING id INTO new_profile_id;

  IF selected_role = 'partner' THEN
    INSERT INTO public.partners (profile_id, fantasy_name, status)
    VALUES (
      new_profile_id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'fantasy_name', ''),
               NULLIF(NEW.raw_user_meta_data->>'name', ''),
               'Empresa Parceira'),
      'pending'
    )
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 12. Enable RLS
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_visits ENABLE ROW LEVEL SECURITY;

-- 13. Policies — partners
CREATE POLICY "partners_public_select_approved" ON public.partners
  FOR SELECT USING (status = 'approved' OR public.is_admin(auth.uid()) OR profile_id = public.current_profile_id());
CREATE POLICY "partners_owner_update" ON public.partners
  FOR UPDATE USING (profile_id = public.current_profile_id());
CREATE POLICY "partners_admin_all" ON public.partners
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 14. Policies — partner_products
CREATE POLICY "partner_products_public_select_approved" ON public.partner_products
  FOR SELECT USING (
    status = 'approved'
    OR public.is_admin(auth.uid())
    OR partner_id = public.current_partner_id()
  );
CREATE POLICY "partner_products_owner_insert" ON public.partner_products
  FOR INSERT WITH CHECK (partner_id = public.current_partner_id());
CREATE POLICY "partner_products_owner_update" ON public.partner_products
  FOR UPDATE USING (partner_id = public.current_partner_id() OR public.is_admin(auth.uid()));
CREATE POLICY "partner_products_owner_delete" ON public.partner_products
  FOR DELETE USING (partner_id = public.current_partner_id() OR public.is_admin(auth.uid()));

-- 15. Policies — partner_posts
CREATE POLICY "partner_posts_public_select" ON public.partner_posts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.partners pt WHERE pt.id = partner_id AND (pt.status = 'approved' OR pt.profile_id = public.current_profile_id()))
    OR public.is_admin(auth.uid())
  );
CREATE POLICY "partner_posts_owner_cud" ON public.partner_posts
  FOR ALL USING (partner_id = public.current_partner_id() OR public.is_admin(auth.uid()))
  WITH CHECK (partner_id = public.current_partner_id() OR public.is_admin(auth.uid()));

-- 16. Policies — partner_visits
CREATE POLICY "partner_visits_partner_select" ON public.partner_visits
  FOR SELECT USING (
    partner_id = public.current_partner_id()
    OR student_id = public.current_student_id()
    OR public.is_admin(auth.uid())
  );
CREATE POLICY "partner_visits_student_insert" ON public.partner_visits
  FOR INSERT WITH CHECK (student_id = public.current_student_id());
CREATE POLICY "partner_visits_admin_all" ON public.partner_visits
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
