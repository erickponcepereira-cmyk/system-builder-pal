
-- Helper: is_coach
CREATE OR REPLACE FUNCTION public.is_coach(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND role = 'coach')
$$;

-- Allow any authenticated user to insert their own partner row
DROP POLICY IF EXISTS partners_owner_insert ON public.partners;
CREATE POLICY partners_owner_insert ON public.partners
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = public.current_profile_id());

-- Coaches can view all partners (to assist with approval)
DROP POLICY IF EXISTS partners_coach_select ON public.partners;
CREATE POLICY partners_coach_select ON public.partners
  FOR SELECT TO authenticated
  USING (public.is_coach(auth.uid()));

-- Coaches can update partner status (approve / reject)
DROP POLICY IF EXISTS partners_coach_update ON public.partners;
CREATE POLICY partners_coach_update ON public.partners
  FOR UPDATE TO authenticated
  USING (public.is_coach(auth.uid()))
  WITH CHECK (public.is_coach(auth.uid()));

-- Coaches can view partner_products to approve them
DROP POLICY IF EXISTS partner_products_coach_select ON public.partner_products;
CREATE POLICY partner_products_coach_select ON public.partner_products
  FOR SELECT TO authenticated
  USING (public.is_coach(auth.uid()));

DROP POLICY IF EXISTS partner_products_coach_update ON public.partner_products;
CREATE POLICY partner_products_coach_update ON public.partner_products
  FOR UPDATE TO authenticated
  USING (public.is_coach(auth.uid()))
  WITH CHECK (public.is_coach(auth.uid()));
