
-- Performance: cache "current user" lookups once per query (initplan) instead of per-row in RLS.

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.current_user_coach_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(c.id), ARRAY[]::uuid[])
  FROM public.coaches c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_student_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[])
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.current_user_is_master_coach()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid() AND public.is_master_coach(c.id)
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_coach_ids() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_student_ids() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_master_coach() TO authenticated, anon;

-- ============================================================
-- coach_evaluation_clients: consolidate SELECT policies
-- ============================================================
DROP POLICY IF EXISTS "Coaches can view own evaluation clients" ON public.coach_evaluation_clients;
DROP POLICY IF EXISTS "Master coaches view all evaluation clients" ON public.coach_evaluation_clients;
DROP POLICY IF EXISTS "Admins can manage all evaluation clients" ON public.coach_evaluation_clients;
DROP POLICY IF EXISTS "Coaches can create own evaluation clients" ON public.coach_evaluation_clients;
DROP POLICY IF EXISTS "Coaches can update own evaluation clients" ON public.coach_evaluation_clients;
DROP POLICY IF EXISTS "Master coaches update evaluation clients" ON public.coach_evaluation_clients;

CREATE POLICY "cec_select" ON public.coach_evaluation_clients FOR SELECT TO authenticated
USING (
  public.current_user_is_admin()
  OR public.current_user_is_master_coach()
  OR coach_id = ANY (public.current_user_coach_ids())
);

CREATE POLICY "cec_insert" ON public.coach_evaluation_clients FOR INSERT TO authenticated
WITH CHECK (
  public.current_user_is_admin()
  OR public.current_user_is_master_coach()
  OR coach_id = ANY (public.current_user_coach_ids())
);

CREATE POLICY "cec_update" ON public.coach_evaluation_clients FOR UPDATE TO authenticated
USING (
  public.current_user_is_admin()
  OR public.current_user_is_master_coach()
  OR coach_id = ANY (public.current_user_coach_ids())
)
WITH CHECK (
  public.current_user_is_admin()
  OR public.current_user_is_master_coach()
  OR coach_id = ANY (public.current_user_coach_ids())
);

CREATE POLICY "cec_delete" ON public.coach_evaluation_clients FOR DELETE TO authenticated
USING (
  public.current_user_is_admin()
  OR coach_id = ANY (public.current_user_coach_ids())
);

-- ============================================================
-- coach_body_assessments: consolidate
-- ============================================================
DROP POLICY IF EXISTS "Admins can manage all body assessments" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "Coaches can create own body assessments" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "Coaches can delete own body assessments" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "Coaches can update own body assessments" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "Coaches can view own body assessments" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "Master coaches create body assessments" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "Master coaches delete body assessments" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "Master coaches update body assessments" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "Master coaches view all body assessments" ON public.coach_body_assessments;
DROP POLICY IF EXISTS "Students can view own body assessments" ON public.coach_body_assessments;

CREATE POLICY "cba_select" ON public.coach_body_assessments FOR SELECT TO authenticated
USING (
  public.current_user_is_admin()
  OR public.current_user_is_master_coach()
  OR coach_id = ANY (public.current_user_coach_ids())
  OR (student_id IS NOT NULL AND student_id = ANY (public.current_user_student_ids()))
);

CREATE POLICY "cba_insert" ON public.coach_body_assessments FOR INSERT TO authenticated
WITH CHECK (
  public.current_user_is_admin()
  OR public.current_user_is_master_coach()
  OR coach_id = ANY (public.current_user_coach_ids())
);

CREATE POLICY "cba_update" ON public.coach_body_assessments FOR UPDATE TO authenticated
USING (
  public.current_user_is_admin()
  OR public.current_user_is_master_coach()
  OR coach_id = ANY (public.current_user_coach_ids())
)
WITH CHECK (
  public.current_user_is_admin()
  OR public.current_user_is_master_coach()
  OR coach_id = ANY (public.current_user_coach_ids())
);

CREATE POLICY "cba_delete" ON public.coach_body_assessments FOR DELETE TO authenticated
USING (
  public.current_user_is_admin()
  OR public.current_user_is_master_coach()
  OR coach_id = ANY (public.current_user_coach_ids())
);

-- ============================================================
-- store_orders & store_order_items: cache student IDs lookup
-- ============================================================
DROP POLICY IF EXISTS "store_orders_student_select" ON public.store_orders;
CREATE POLICY "store_orders_student_select" ON public.store_orders FOR SELECT TO authenticated
USING (student_id = ANY (public.current_user_student_ids()));

DROP POLICY IF EXISTS "store_order_items_student_select" ON public.store_order_items;
CREATE POLICY "store_order_items_student_select" ON public.store_order_items FOR SELECT TO authenticated
USING (
  order_id IN (
    SELECT id FROM public.store_orders
    WHERE student_id = ANY (public.current_user_student_ids())
  )
);
