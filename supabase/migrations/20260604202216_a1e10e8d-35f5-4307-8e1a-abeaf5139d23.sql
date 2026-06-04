ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_app_login_at timestamptz;
CREATE INDEX IF NOT EXISTS profiles_last_app_login_at_idx ON public.profiles(last_app_login_at);