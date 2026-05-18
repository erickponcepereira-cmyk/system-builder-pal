
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profession varchar(100),
  ADD COLUMN IF NOT EXISTS instagram varchar(100),
  ADD COLUMN IF NOT EXISTS blood_type varchar(5);

ALTER TABLE public.anamnesis_forms
  ADD COLUMN IF NOT EXISTS gender varchar(20),
  ADD COLUMN IF NOT EXISTS height numeric(5,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars_owner_insert') THEN
    CREATE POLICY "avatars_owner_insert" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars_owner_update') THEN
    CREATE POLICY "avatars_owner_update" ON storage.objects FOR UPDATE TO authenticated
      USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars_owner_delete') THEN
    CREATE POLICY "avatars_owner_delete" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='avatars_public_select') THEN
    CREATE POLICY "avatars_public_select" ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');
  END IF;
END $$;
