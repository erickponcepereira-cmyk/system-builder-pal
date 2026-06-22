
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_profile_id UUID;
  raw_role TEXT;
  selected_role public.user_role;
BEGIN
  raw_role := NULLIF(NEW.raw_user_meta_data->>'role', '');
  IF raw_role IN ('coach','partner','student','manager','director') THEN
    selected_role := raw_role::public.user_role;
  ELSE
    selected_role := 'student';
  END IF;
  INSERT INTO public.profiles (user_id, name, email, role)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'name',''), NEW.email), NEW.email, selected_role)
  ON CONFLICT (user_id) DO UPDATE
  SET name=COALESCE(EXCLUDED.name, public.profiles.name),
      email=COALESCE(EXCLUDED.email, public.profiles.email),
      role=CASE WHEN public.profiles.role='admin' THEN public.profiles.role ELSE EXCLUDED.role END
  RETURNING id INTO new_profile_id;
  IF selected_role='partner' THEN
    INSERT INTO public.partners (profile_id, fantasy_name, status)
    VALUES (new_profile_id,
      COALESCE(NULLIF(NEW.raw_user_meta_data->>'fantasy_name',''),
               NULLIF(NEW.raw_user_meta_data->>'name',''),
               'Empresa Parceira'),
      'pending')
    ON CONFLICT (profile_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_profile_admin_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor_id UUID; remaining INTEGER;
  caller_is_admin BOOLEAN; caller_is_master BOOLEAN;
BEGIN
  caller_is_admin  := auth.uid() IS NULL OR public.is_admin(auth.uid());
  caller_is_master := auth.uid() IS NULL OR public.is_master_admin(auth.uid());
  IF auth.uid() IS NOT NULL AND NOT caller_is_admin THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_master_admin IS DISTINCT FROM OLD.is_master_admin
       OR NEW.admin_permissions IS DISTINCT FROM OLD.admin_permissions
       OR NEW.report_permissions IS DISTINCT FROM OLD.report_permissions
       OR NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'Não é permitido alterar campos protegidos do perfil';
    END IF;
  END IF;
  SELECT id INTO actor_id FROM public.profiles WHERE user_id = auth.uid();
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.uid() IS NOT NULL AND NOT caller_is_master THEN
      IF OLD.role='admin' OR NEW.role='admin' THEN
        RAISE EXCEPTION 'Apenas o admin máster pode promover ou revogar administradores';
      END IF;
    END IF;
    IF OLD.is_master_admin=true AND NEW.role<>'admin' THEN
      RAISE EXCEPTION 'Não é permitido revogar o admin máster';
    END IF;
    IF OLD.role='admin' AND NEW.role<>'admin' THEN
      SELECT COUNT(*) INTO remaining FROM public.profiles
      WHERE role='admin' AND id<>OLD.id AND COALESCE(status,'active')<>'blocked';
      IF remaining<1 THEN RAISE EXCEPTION 'Não é possível revogar o último administrador ativo'; END IF;
    END IF;
    INSERT INTO public.admin_audit_log (actor_profile_id, target_profile_id, action, before_role, after_role)
    VALUES (actor_id, NEW.id,
      CASE WHEN NEW.role='admin' THEN 'promote_admin'
           WHEN OLD.role='admin' THEN 'revoke_admin' ELSE 'role_change' END,
      OLD.role::text, NEW.role::text);
  END IF;
  IF NEW.admin_permissions IS DISTINCT FROM OLD.admin_permissions
     AND (NEW.role='admin' OR OLD.role='admin') THEN
    IF auth.uid() IS NOT NULL AND NOT caller_is_master THEN
      RAISE EXCEPTION 'Apenas o admin máster pode editar permissões de administradores';
    END IF;
    INSERT INTO public.admin_audit_log (actor_profile_id, target_profile_id, action, before_permissions, after_permissions)
    VALUES (actor_id, NEW.id, 'permissions_change', OLD.admin_permissions, NEW.admin_permissions);
  END IF;
  RETURN NEW;
END;
$$;

DROP POLICY IF EXISTS profiles_own_update ON public.profiles;
CREATE POLICY profiles_own_update ON public.profiles FOR UPDATE
  TO authenticated USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);

CREATE OR REPLACE FUNCTION public.guard_coaches_self_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    IF NEW.approved_at IS DISTINCT FROM OLD.approved_at
       OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
       OR NEW.upline_coach_id IS DISTINCT FROM OLD.upline_coach_id
       OR NEW.is_professional IS DISTINCT FROM OLD.is_professional
       OR NEW.total_points IS DISTINCT FROM OLD.total_points
       OR NEW.total_sales IS DISTINCT FROM OLD.total_sales
       OR NEW.onboarding_stage IS DISTINCT FROM OLD.onboarding_stage
       OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
       OR NEW.master_coach_commission_pct IS DISTINCT FROM OLD.master_coach_commission_pct
       OR NEW.coach_number IS DISTINCT FROM OLD.coach_number THEN
      RAISE EXCEPTION 'Não é permitido alterar campos protegidos do coach';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_coaches_self_update ON public.coaches;
CREATE TRIGGER trg_guard_coaches_self_update BEFORE UPDATE ON public.coaches
  FOR EACH ROW EXECUTE FUNCTION public.guard_coaches_self_update();

DROP POLICY IF EXISTS notif_insert_any_authenticated ON public.notifications;
CREATE POLICY notif_insert_own_only ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (profile_id IN (SELECT id FROM public.profiles WHERE user_id=auth.uid()));

DROP POLICY IF EXISTS "Public can read share by token" ON public.assessment_shares;
CREATE OR REPLACE FUNCTION public.get_assessment_share_by_token(_token text)
RETURNS public.assessment_shares LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT * FROM public.assessment_shares WHERE token=_token LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_assessment_share_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_assessment_share_by_token(text) TO anon, authenticated;

DROP POLICY IF EXISTS pposl_own_select ON public.partner_product_order_status_log;
CREATE POLICY pposl_own_select ON public.partner_product_order_status_log FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR order_id IN (
      SELECT ppo.id FROM public.partner_product_orders ppo
      WHERE ppo.student_id IN (
              SELECT s.id FROM public.students s
              JOIN public.profiles p ON p.id=s.profile_id
              WHERE p.user_id=auth.uid())
         OR ppo.selling_coach_id = public.current_coach_id()
         OR ppo.professional_coach_id = public.current_coach_id()
         OR ppo.partner_id = public.current_partner_id()
    )
  );

DROP POLICY IF EXISTS partner_products_coach_update ON public.partner_products;
DROP POLICY IF EXISTS partner_products_coach_select ON public.partner_products;
DROP POLICY IF EXISTS partners_coach_update ON public.partners;

CREATE OR REPLACE FUNCTION public.guard_professional_appointments_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    IF NEW.professional_coach_id IS DISTINCT FROM OLD.professional_coach_id
       OR NEW.seller_coach_id IS DISTINCT FROM OLD.seller_coach_id
       OR NEW.student_id IS DISTINCT FROM OLD.student_id
       OR NEW.product_id IS DISTINCT FROM OLD.product_id
       OR NEW.order_id IS DISTINCT FROM OLD.order_id
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.ends_at IS DISTINCT FROM OLD.ends_at THEN
      RAISE EXCEPTION 'Apenas status e cancelamento podem ser alterados';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_professional_appointments_update ON public.professional_appointments;
CREATE TRIGGER trg_guard_professional_appointments_update BEFORE UPDATE ON public.professional_appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_professional_appointments_update();

DROP POLICY IF EXISTS appt_update_cancel ON public.professional_appointments;
CREATE POLICY appt_update_cancel ON public.professional_appointments FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id
               WHERE c.id=professional_appointments.professional_coach_id AND p.user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id
               WHERE c.id=professional_appointments.seller_coach_id AND p.user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.students s JOIN public.profiles p ON p.id=s.profile_id
               WHERE s.id=professional_appointments.student_id AND p.user_id=auth.uid())
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id
               WHERE c.id=professional_appointments.professional_coach_id AND p.user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id=c.profile_id
               WHERE c.id=professional_appointments.seller_coach_id AND p.user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.students s JOIN public.profiles p ON p.id=s.profile_id
               WHERE s.id=professional_appointments.student_id AND p.user_id=auth.uid())
  );

DROP POLICY IF EXISTS "Student or any coach reads achievements" ON public.workout_achievements;
CREATE POLICY workout_achievements_scoped_select ON public.workout_achievements FOR SELECT
  TO authenticated
  USING (
    student_id=auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.coaches c ON c.id=s.coach_id
      JOIN public.profiles p ON p.id=c.profile_id
      WHERE s.profile_id IN (SELECT id FROM public.profiles WHERE user_id=workout_achievements.student_id)
        AND p.user_id=auth.uid()
    )
  );

REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, name, avatar_url, role, created_at) ON public.profiles TO anon;
REVOKE SELECT ON public.coaches FROM anon;
GRANT SELECT (id, profile_id, referral_code, upline_coach_id, approved_at,
  total_points, total_sales, is_professional, specialty_key, coach_number, created_at) ON public.coaches TO anon;

DROP POLICY IF EXISTS "store-images authenticated insert" ON storage.objects;
DROP POLICY IF EXISTS "store-images authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "store-images authenticated delete" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS avatars_public_select ON storage.objects;

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.validate_master_coach_commission_pct() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.admin_purge_user_dependents(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.unblock_coach(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_paid_transaction(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_monthly_rankings(date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_coach_patents() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_available_commissions() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_store_order_paid_and_process(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_nutritionist_blocked_entry(uuid, text) FROM anon;

ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS realtime_authenticated_only ON realtime.messages;
CREATE POLICY realtime_authenticated_only ON realtime.messages
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS realtime_authenticated_send ON realtime.messages;
CREATE POLICY realtime_authenticated_send ON realtime.messages
  FOR INSERT TO authenticated WITH CHECK (true);
