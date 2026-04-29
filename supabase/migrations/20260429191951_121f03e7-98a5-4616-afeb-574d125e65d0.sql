CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NEW.email),
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', '')::public.user_role, 'student')
  )
  ON CONFLICT (user_id) DO UPDATE
  SET name = COALESCE(EXCLUDED.name, public.profiles.name),
      email = COALESCE(EXCLUDED.email, public.profiles.email),
      role = EXCLUDED.role;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coaches'
      AND policyname = 'coaches_own_insert'
  ) THEN
    CREATE POLICY coaches_own_insert
    ON public.coaches
    FOR INSERT
    TO authenticated
    WITH CHECK (
      profile_id IN (
        SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
      )
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'coaches'
      AND policyname = 'coaches_own_insert'
  ) THEN
    CREATE POLICY coaches_own_insert
    ON public.coaches
    FOR INSERT
    TO authenticated
    WITH CHECK (
      profile_id IN (
        SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
      )
    );
  END IF;
END $$;