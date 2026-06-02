ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender varchar(10);
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_gender_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_gender_check CHECK (gender IS NULL OR gender IN ('M','F','O'));