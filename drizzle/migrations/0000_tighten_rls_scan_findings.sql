ALTER TABLE public.auditoria_fechamento_rede_202607 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auditoria_fechamento_rede_202607 FROM anon;
CREATE POLICY auditoria_fechamento_admin_all ON public.auditoria_fechamento_rede_202607
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS leads_insert_authenticated ON public.leads;
CREATE POLICY leads_insert_own_coach ON public.leads FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) OR coach_id = ANY (public.current_user_coach_ids()));

DROP POLICY IF EXISTS audit_insert_authenticated ON public.evaluation_link_audit;
CREATE POLICY audit_insert_own_coach ON public.evaluation_link_audit FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_admin() OR coach_id = ANY (public.current_user_coach_ids()));

DROP POLICY IF EXISTS finalization_log_read_all ON public.competition_finalization_log;
DROP POLICY IF EXISTS "share codes readable by authenticated" ON public.entity_share_codes;
DROP POLICY IF EXISTS fee_configs_read_authenticated ON public.payment_fee_configs;
DROP POLICY IF EXISTS event_attendances_authenticated_select ON public.event_attendances;
CREATE POLICY event_attendances_self_select ON public.event_attendances FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id());
DROP POLICY IF EXISTS "Auth users can list product downloads" ON public.product_downloads;

DROP POLICY IF EXISTS herbalife_boletos_auth_read ON storage.objects;
DROP POLICY IF EXISTS herbalife_boletos_auth_upload ON storage.objects;
CREATE POLICY herbalife_boletos_owner_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'herbalife-boletos' AND (storage.foldername(name))[1] = (select auth.uid()::text));
CREATE POLICY herbalife_boletos_owner_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'herbalife-boletos' AND (storage.foldername(name))[1] = (select auth.uid()::text));