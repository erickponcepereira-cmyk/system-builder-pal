ALTER TABLE public.competition_appointments REPLICA IDENTITY FULL;
ALTER TABLE public.competition_enrollments REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_appointments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_enrollments; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;