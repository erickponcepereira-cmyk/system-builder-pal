-- ============ professional_products ============
DROP POLICY IF EXISTS "Admins manage professional products" ON public.professional_products;
DROP POLICY IF EXISTS "Professional manages own products" ON public.professional_products;
DROP POLICY IF EXISTS "Public reads active approved professional products" ON public.professional_products;
DROP POLICY IF EXISTS "Upline coach approves downline professional products" ON public.professional_products;
DROP POLICY IF EXISTS "Upline coach views downline professional products" ON public.professional_products;

CREATE POLICY "pp_select" ON public.professional_products
FOR SELECT TO anon, authenticated
USING (
  (status = 'approved' AND is_active_by_professional = true)
  OR (select public.is_admin(auth.uid()))
  OR coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = (select auth.uid()) AND c.is_professional = true
  )
  OR coach_id IN (
    SELECT prof.id FROM public.coaches prof
    JOIN public.coaches upline ON upline.id = prof.upline_coach_id
    JOIN public.profiles up ON up.id = upline.profile_id
    WHERE up.user_id = (select auth.uid()) AND prof.is_professional = true
  )
);

CREATE POLICY "pp_insert" ON public.professional_products
FOR INSERT TO authenticated
WITH CHECK (
  (select public.is_admin(auth.uid()))
  OR coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = (select auth.uid()) AND c.is_professional = true
  )
);

CREATE POLICY "pp_update" ON public.professional_products
FOR UPDATE TO authenticated
USING (
  (select public.is_admin(auth.uid()))
  OR coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = (select auth.uid()) AND c.is_professional = true
  )
  OR coach_id IN (
    SELECT prof.id FROM public.coaches prof
    JOIN public.coaches upline ON upline.id = prof.upline_coach_id
    JOIN public.profiles up ON up.id = upline.profile_id
    WHERE up.user_id = (select auth.uid()) AND prof.is_professional = true
  )
)
WITH CHECK (
  (select public.is_admin(auth.uid()))
  OR coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = (select auth.uid()) AND c.is_professional = true
  )
  OR coach_id IN (
    SELECT prof.id FROM public.coaches prof
    JOIN public.coaches upline ON upline.id = prof.upline_coach_id
    JOIN public.profiles up ON up.id = upline.profile_id
    WHERE up.user_id = (select auth.uid()) AND prof.is_professional = true
  )
);

CREATE POLICY "pp_delete" ON public.professional_products
FOR DELETE TO authenticated
USING (
  (select public.is_admin(auth.uid()))
  OR coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = (select auth.uid()) AND c.is_professional = true
  )
);

-- ============ partner_products ============
DROP POLICY IF EXISTS "partner_products_public_select_approved" ON public.partner_products;
CREATE POLICY "partner_products_public_select_approved" ON public.partner_products
FOR SELECT TO public
USING (
  (status)::text = 'approved'::text
  OR (select public.is_admin(auth.uid()))
  OR partner_id = (select public.current_partner_id())
);

-- ============ coach_body_assessments ============
DROP POLICY IF EXISTS "cba_select" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "cba_insert" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "cba_update" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "cba_delete" ON public.coach_body_assessments;

CREATE POLICY "cba_select" ON public.coach_body_assessments
FOR SELECT TO authenticated
USING (
  (select public.current_user_is_admin())
  OR (select public.current_user_is_master_coach())
  OR coach_id IN (SELECT unnest(public.current_user_coach_ids()))
  OR (student_id IS NOT NULL AND student_id IN (SELECT unnest(public.current_user_student_ids())))
);

CREATE POLICY "cba_insert" ON public.coach_body_assessments
FOR INSERT TO authenticated
WITH CHECK (
  (select public.current_user_is_admin())
  OR (select public.current_user_is_master_coach())
  OR coach_id IN (SELECT unnest(public.current_user_coach_ids()))
);

CREATE POLICY "cba_update" ON public.coach_body_assessments
FOR UPDATE TO authenticated
USING (
  (select public.current_user_is_admin())
  OR (select public.current_user_is_master_coach())
  OR coach_id IN (SELECT unnest(public.current_user_coach_ids()))
)
WITH CHECK (
  (select public.current_user_is_admin())
  OR (select public.current_user_is_master_coach())
  OR coach_id IN (SELECT unnest(public.current_user_coach_ids()))
);

CREATE POLICY "cba_delete" ON public.coach_body_assessments
FOR DELETE TO authenticated
USING (
  (select public.current_user_is_admin())
  OR (select public.current_user_is_master_coach())
  OR coach_id IN (SELECT unnest(public.current_user_coach_ids()))
);

-- ============ coach_evaluation_clients ============
DROP POLICY IF EXISTS "cec_select" ON public.coach_evaluation_clients;
DROP POLICY IF EXISTS "cec_insert" ON public.coach_evaluation_clients;
DROP POLICY IF EXISTS "cec_update" ON public.coach_evaluation_clients;
DROP POLICY IF EXISTS "cec_delete" ON public.coach_evaluation_clients;

CREATE POLICY "cec_select" ON public.coach_evaluation_clients
FOR SELECT TO authenticated
USING (
  (select public.current_user_is_admin())
  OR (select public.current_user_is_master_coach())
  OR coach_id IN (SELECT unnest(public.current_user_coach_ids()))
);

CREATE POLICY "cec_insert" ON public.coach_evaluation_clients
FOR INSERT TO authenticated
WITH CHECK (
  (select public.current_user_is_admin())
  OR (select public.current_user_is_master_coach())
  OR coach_id IN (SELECT unnest(public.current_user_coach_ids()))
);

CREATE POLICY "cec_update" ON public.coach_evaluation_clients
FOR UPDATE TO authenticated
USING (
  (select public.current_user_is_admin())
  OR (select public.current_user_is_master_coach())
  OR coach_id IN (SELECT unnest(public.current_user_coach_ids()))
)
WITH CHECK (
  (select public.current_user_is_admin())
  OR (select public.current_user_is_master_coach())
  OR coach_id IN (SELECT unnest(public.current_user_coach_ids()))
);

CREATE POLICY "cec_delete" ON public.coach_evaluation_clients
FOR DELETE TO authenticated
USING (
  (select public.current_user_is_admin())
  OR coach_id IN (SELECT unnest(public.current_user_coach_ids()))
);

ANALYZE public.professional_products;
ANALYZE public.partner_products;
ANALYZE public.coach_body_assessments;
ANALYZE public.coach_evaluation_clients;