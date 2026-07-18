DO $$
DECLARE tbl record;
BEGIN
  FOR tbl IN SELECT c.relname AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE c.relkind='r' AND ns.nspname='public' LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', tbl.n);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', tbl.n);
  END LOOP;
END $$;

-- Restore anon SELECT only on known public-facing tables (policies allow anon reads)
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.partner_products TO anon;
GRANT SELECT ON public.professional_products TO anon;
GRANT SELECT ON public.professional_public_profile TO anon;
GRANT SELECT ON public.professional_specialties TO anon;
GRANT SELECT ON public.store_products TO anon;
GRANT SELECT ON public.store_categories TO anon;
GRANT SELECT ON public.store_subcategories TO anon;
GRANT SELECT ON public.store_sections TO anon;
GRANT SELECT ON public.digital_products TO anon;
GRANT SELECT ON public.motivational_quotes TO anon;
GRANT SELECT ON public.subscription_plans TO anon;
GRANT SELECT ON public.freebies TO anon;
GRANT SELECT ON public.exercise_library TO anon;
GRANT SELECT ON public.fitmind_events TO anon;
GRANT SELECT ON public.live_events TO anon;
GRANT SELECT ON public.event_tickets TO anon;
GRANT SELECT ON public.partners TO anon;
GRANT SELECT ON public.coaches TO anon;
GRANT SELECT ON public.app_settings TO anon;

-- Grant usage on all sequences too
DO $$
DECLARE s record;
BEGIN
  FOR s IN SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema='public' LOOP
    EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE public.%I TO authenticated, service_role', s.sequence_name);
  END LOOP;
END $$;