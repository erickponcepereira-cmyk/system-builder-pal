
UPDATE auth.users
SET encrypted_password = crypt('Fitmind@2026', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE lower(email) = 'cheffemcasabuffet@gmail.com';

UPDATE public.profiles
SET must_reset_password = true
WHERE lower(email) = 'cheffemcasabuffet@gmail.com';
