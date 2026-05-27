
ALTER TABLE public.commissions ALTER COLUMN percentage DROP NOT NULL;
ALTER TABLE public.commissions ALTER COLUMN percentage SET DEFAULT 0;
UPDATE public.commissions SET percentage = 0 WHERE percentage IS NULL;
