-- ============================================================
-- 1. test_accounts: senha padrão só para admin
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can read test accounts" ON public.test_accounts;
REVOKE SELECT ON public.test_accounts FROM anon;

-- ============================================================
-- 2. event_attendances: exige login
-- ============================================================
DROP POLICY IF EXISTS event_attendances_public_select ON public.event_attendances;
CREATE POLICY event_attendances_authenticated_select ON public.event_attendances
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.event_attendances FROM anon;

-- ============================================================
-- 3. partners: anon só enxerga colunas de vitrine
-- ============================================================
REVOKE SELECT ON public.partners FROM anon;
GRANT SELECT (
  id, profile_id, referral_code, upline_coach_id, status, approved_at,
  fantasy_name, business_area, specialty, description, city, state,
  photo_url, cover_url, website, instagram, facebook, document_type,
  card_valid_until, created_at, updated_at
) ON public.partners TO anon;

DROP POLICY IF EXISTS partners_admin_all ON public.partners;
CREATE POLICY partners_admin_all ON public.partners
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS partners_public_select_approved ON public.partners;
CREATE POLICY partners_public_select_approved ON public.partners
  FOR SELECT TO anon, authenticated
  USING (
    (status)::text = 'approved'::text
    OR is_admin(auth.uid())
    OR profile_id = current_profile_id()
  );

-- ============================================================
-- 4. coaches: dados bancários fora do alcance do cliente
-- ============================================================
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO cols
    FROM pg_attribute
   WHERE attrelid = 'public.coaches'::regclass
     AND attnum > 0 AND NOT attisdropped
     AND attname NOT IN (
       'pix_key','pix_key_type','bank_name','bank_agency','bank_account','bank_account_type'
     );
  EXECUTE 'REVOKE SELECT ON public.coaches FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.coaches TO authenticated', cols);
END $$;

DROP POLICY IF EXISTS coaches_admin_all ON public.coaches;
CREATE POLICY coaches_admin_all ON public.coaches
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY IF EXISTS approved_coaches_public_select ON public.coaches;
CREATE POLICY approved_coaches_public_select ON public.coaches
  FOR SELECT TO anon, authenticated
  USING (approved_at IS NOT NULL);

-- ============================================================
-- 5. profiles: CPF e endereço fora do alcance do cliente
-- ============================================================
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO cols
    FROM pg_attribute
   WHERE attrelid = 'public.profiles'::regclass
     AND attnum > 0 AND NOT attisdropped
     AND attname NOT IN (
       'cpf','cpf_hash','street','number','neighborhood','zip_code'
     );
  EXECUTE 'REVOKE SELECT ON public.profiles FROM authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.profiles TO authenticated', cols);
END $$;

-- ============================================================
-- 6. Funções: search_path fixo
-- ============================================================
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proconfig IS NULL
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pgmq, pg_temp', f.sig);
  END LOOP;
END $$;

-- ============================================================
-- 7. Funções de gatilho: ninguém chama diretamente
-- ============================================================
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.sig);
  END LOOP;
END $$;

-- ============================================================
-- 8. Funções privilegiadas: fora do alcance de visitante anônimo
-- ============================================================
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.prorettype <> 'trigger'::regtype
       AND (
         p.proname LIKE 'admin\_%'
         OR p.proname IN (
           'enqueue_email','delete_email','read_email_batch','move_to_dlq','email_queue_dispatch',
           'generate_monthly_invoices','mark_overdue_invoices','generate_competition_reminders',
           'expire_unpaid_product_orders','expire_unpaid_professional_appointments',
           'debit_user_wallets_cascade','pay_partner_order_with_wallet','pay_store_order_with_wallet',
           'process_partner_product_order_paid','process_subscription_invoice_payment',
           'grant_partner_product_perks','grant_run_challenge_tickets',
           'extend_coach_card_access','extend_student_card_access','extend_user_membership_cards',
           'get_my_cpf','list_all_students_for_master','list_coach_team_clients',
           'partner_preview_student','partner_scan_student','partner_checkin',
           'coach_store_list_my_hidden','coach_store_set_hidden','my_freebie_usage',
           'join_student_challenge_group','link_professional_collaborator','unlink_professional_collaborator',
           'ensure_user_subscription','auto_ensure_subscription_for_profile',
           'assign_professionals_for_transaction','cadeia_coaches_do_perfil','get_viewer_upline_coach_ids'
         )
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
  END LOOP;
END $$;
