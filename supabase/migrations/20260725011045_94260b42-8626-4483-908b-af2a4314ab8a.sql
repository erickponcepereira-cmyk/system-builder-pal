
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS must_reset_password BOOLEAN NOT NULL DEFAULT false;
UPDATE public.profiles SET must_reset_password = true WHERE lower(email) = 'cheffemcasabuffet@gmail.com';
