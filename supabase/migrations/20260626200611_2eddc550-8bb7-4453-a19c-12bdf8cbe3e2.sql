CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_profile_id UUID;
  raw_role TEXT;
  selected_role public.user_role;
  existing_profile RECORD;
BEGIN
  raw_role := NULLIF(NEW.raw_user_meta_data->>'role', '');
  IF raw_role IN ('coach','partner','student','manager','director') THEN
    selected_role := raw_role::public.user_role;
  ELSE
    selected_role := 'student';
  END IF;

  -- Reaproveita perfil órfão com o mesmo email (auth.user antigo deletado)
  SELECT id, user_id INTO existing_profile
    FROM public.profiles
   WHERE email = NEW.email
   LIMIT 1;

  IF FOUND AND existing_profile.user_id IS DISTINCT FROM NEW.id THEN
    UPDATE public.profiles
       SET user_id = NEW.id,
           name = COALESCE(NULLIF(NEW.raw_user_meta_data->>'name',''), name, NEW.email),
           role = CASE WHEN role='admin' THEN role ELSE selected_role END
     WHERE id = existing_profile.id
     RETURNING id INTO new_profile_id;
  ELSE
    INSERT INTO public.profiles (user_id, name, email, role)
    VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'name',''), NEW.email), NEW.email, selected_role)
    ON CONFLICT (user_id) DO UPDATE
    SET name=COALESCE(EXCLUDED.name, public.profiles.name),
        email=COALESCE(EXCLUDED.email, public.profiles.email),
        role=CASE WHEN public.profiles.role='admin' THEN public.profiles.role ELSE EXCLUDED.role END
    RETURNING id INTO new_profile_id;
  END IF;

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
$function$;