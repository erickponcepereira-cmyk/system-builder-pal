-- 1) Tabela de membros da unidade
CREATE TABLE IF NOT EXISTS public.partner_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  papel text NOT NULL DEFAULT 'staff' CHECK (papel IN ('owner','manager','staff')),
  permissoes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_partner_members_profile ON public.partner_members(profile_id);
CREATE INDEX IF NOT EXISTS idx_partner_members_partner ON public.partner_members(partner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_members TO authenticated;
GRANT ALL ON public.partner_members TO service_role;

ALTER TABLE public.partner_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_partner_members_updated_at ON public.partner_members;
CREATE TRIGGER trg_partner_members_updated_at BEFORE UPDATE ON public.partner_members
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Backfill: dono de cada parceiro existente
INSERT INTO public.partner_members (partner_id, profile_id, papel, permissoes)
SELECT pt.id, pt.profile_id, 'owner', '{}'
FROM public.partners pt
WHERE pt.profile_id IS NOT NULL
ON CONFLICT (partner_id, profile_id) DO NOTHING;

-- 3) Funções de permissão
CREATE OR REPLACE FUNCTION public.partner_pode(_partner_id uuid, _permissao text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT true
    FROM public.partner_members m
    JOIN public.profiles pr ON pr.id = m.profile_id
    WHERE m.partner_id = _partner_id
      AND pr.user_id = auth.uid()
      AND (m.papel = 'owner' OR _permissao = ANY(m.permissoes))
    LIMIT 1
  ), false)
  OR COALESCE(public.is_admin(auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.current_partner_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.partner_id
  FROM public.partner_members m
  JOIN public.profiles pr ON pr.id = m.profile_id
  WHERE pr.user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.current_partner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.partner_id
  FROM public.partner_members m
  JOIN public.profiles pr ON pr.id = m.profile_id
  WHERE pr.user_id = auth.uid()
  ORDER BY (m.papel = 'owner') DESC, m.created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.minhas_unidades_parceiro()
RETURNS TABLE (
  partner_id uuid,
  fantasy_name text,
  city text,
  state text,
  photo_url text,
  status text,
  papel text,
  permissoes text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pt.id, pt.fantasy_name, pt.city, pt.state, pt.photo_url, pt.status::text, m.papel, m.permissoes
  FROM public.partner_members m
  JOIN public.partners pt ON pt.id = m.partner_id
  JOIN public.profiles pr ON pr.id = m.profile_id
  WHERE pr.user_id = auth.uid()
  ORDER BY (m.papel = 'owner') DESC, pt.fantasy_name ASC
$$;

GRANT EXECUTE ON FUNCTION public.partner_pode(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_partner_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.minhas_unidades_parceiro() TO authenticated;

-- 4) Proteção da linha owner
CREATE OR REPLACE FUNCTION public.guard_partner_members_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(public.is_admin(auth.uid()), false) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'DELETE' AND OLD.papel = 'owner' THEN
    RAISE EXCEPTION 'Não é possível remover o dono da unidade';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.papel = 'owner' AND (NEW.papel <> 'owner' OR NEW.profile_id <> OLD.profile_id) THEN
    RAISE EXCEPTION 'Não é possível alterar o dono da unidade';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_partner_members_owner ON public.partner_members;
CREATE TRIGGER trg_guard_partner_members_owner
BEFORE UPDATE OR DELETE ON public.partner_members
FOR EACH ROW EXECUTE FUNCTION public.guard_partner_members_owner();

-- 5) RLS de partner_members
DROP POLICY IF EXISTS partner_members_select ON public.partner_members;
CREATE POLICY partner_members_select ON public.partner_members
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR partner_id IN (SELECT public.current_partner_ids())
);

DROP POLICY IF EXISTS partner_members_insert ON public.partner_members;
CREATE POLICY partner_members_insert ON public.partner_members
FOR INSERT TO authenticated
WITH CHECK (public.partner_pode(partner_id, 'members.gerenciar'));

DROP POLICY IF EXISTS partner_members_update ON public.partner_members;
CREATE POLICY partner_members_update ON public.partner_members
FOR UPDATE TO authenticated
USING (public.partner_pode(partner_id, 'members.gerenciar'))
WITH CHECK (public.partner_pode(partner_id, 'members.gerenciar'));

DROP POLICY IF EXISTS partner_members_delete ON public.partner_members;
CREATE POLICY partner_members_delete ON public.partner_members
FOR DELETE TO authenticated
USING (public.partner_pode(partner_id, 'members.gerenciar'));

-- 6) Policies existentes -> permissão por unidade + TO authenticated
DROP POLICY IF EXISTS partner_products_owner_insert ON public.partner_products;
CREATE POLICY partner_products_owner_insert ON public.partner_products
FOR INSERT TO authenticated
WITH CHECK (public.partner_pode(partner_id, 'products.editar'));

DROP POLICY IF EXISTS partner_products_owner_update ON public.partner_products;
CREATE POLICY partner_products_owner_update ON public.partner_products
FOR UPDATE TO authenticated
USING (public.partner_pode(partner_id, 'products.editar'))
WITH CHECK (public.partner_pode(partner_id, 'products.editar'));

DROP POLICY IF EXISTS partner_products_owner_delete ON public.partner_products;
CREATE POLICY partner_products_owner_delete ON public.partner_products
FOR DELETE TO authenticated
USING (public.partner_pode(partner_id, 'products.editar'));

DROP POLICY IF EXISTS "schedules manage owner" ON public.partner_product_schedules;
CREATE POLICY "schedules manage owner" ON public.partner_product_schedules
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.partner_products pp
  WHERE pp.id = partner_product_schedules.partner_product_id
    AND public.partner_pode(pp.partner_id, 'freebies.editar')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.partner_products pp
  WHERE pp.id = partner_product_schedules.partner_product_id
    AND public.partner_pode(pp.partner_id, 'freebies.editar')
));

DROP POLICY IF EXISTS "Partners and admins can read establishment reservations" ON public.partner_freebie_reservations;
CREATE POLICY "Partners and admins can read establishment reservations" ON public.partner_freebie_reservations
FOR SELECT TO authenticated
USING (
  public.partner_pode(partner_id, 'scanner.usar')
  OR public.partner_pode(partner_id, 'freebies.editar')
);

DROP POLICY IF EXISTS "Partner reads own wallet" ON public.partner_wallets;
CREATE POLICY "Partner reads own wallet" ON public.partner_wallets
FOR SELECT TO authenticated
USING (public.partner_pode(partner_id, 'wallet.ver'));

DROP POLICY IF EXISTS ppo_partner_select ON public.partner_product_orders;
CREATE POLICY ppo_partner_select ON public.partner_product_orders
FOR SELECT TO authenticated
USING (public.partner_pode(partner_id, 'orders.ver'));

DROP POLICY IF EXISTS pposl_own_select ON public.partner_product_order_status_log;
CREATE POLICY pposl_own_select ON public.partner_product_order_status_log
FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR order_id IN (
    SELECT ppo.id FROM public.partner_product_orders ppo
    WHERE ppo.student_id IN (
        SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid()
      )
      OR ppo.selling_coach_id = public.current_coach_id()
      OR ppo.professional_coach_id = public.current_coach_id()
      OR public.partner_pode(ppo.partner_id, 'orders.ver')
  )
);

DROP POLICY IF EXISTS partner_posts_owner_cud ON public.partner_posts;
CREATE POLICY partner_posts_owner_cud ON public.partner_posts
FOR ALL TO authenticated
USING (public.partner_pode(partner_id, 'timeline.editar'))
WITH CHECK (public.partner_pode(partner_id, 'timeline.editar'));

DROP POLICY IF EXISTS partner_visits_partner_select ON public.partner_visits;
CREATE POLICY partner_visits_partner_select ON public.partner_visits
FOR SELECT TO authenticated
USING (
  public.partner_pode(partner_id, 'overview.ver')
  OR student_id = public.current_student_id()
  OR public.is_admin(auth.uid())
);

DROP POLICY IF EXISTS partner_visits_partner_insert ON public.partner_visits;
CREATE POLICY partner_visits_partner_insert ON public.partner_visits
FOR INSERT TO authenticated
WITH CHECK (public.partner_pode(partner_id, 'scanner.usar'));

DROP POLICY IF EXISTS coupon_partner_select ON public.partner_coupons;
CREATE POLICY coupon_partner_select ON public.partner_coupons
FOR SELECT TO authenticated
USING (public.partner_pode(partner_id, 'orders.ver'));

DROP POLICY IF EXISTS partners_owner_update ON public.partners;
CREATE POLICY partners_owner_update ON public.partners
FOR UPDATE TO authenticated
USING (public.partner_pode(id, 'profile.editar'))
WITH CHECK (public.partner_pode(id, 'profile.editar'));