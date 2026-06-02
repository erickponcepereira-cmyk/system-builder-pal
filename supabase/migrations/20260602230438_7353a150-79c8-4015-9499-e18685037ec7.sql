-- 1. Add unique sequential coach number
ALTER TABLE public.coaches ADD COLUMN IF NOT EXISTS coach_number INTEGER;

-- Assign explicit numbers per user request
UPDATE public.coaches SET coach_number = 1 WHERE id = '0dc01639-fd6e-4c87-86e4-dcd057aed5d8'; -- Nathan
UPDATE public.coaches SET coach_number = 2 WHERE id = 'f25c12d0-98eb-4cdc-85ed-b9a2f672b36e'; -- Ana Fávia
UPDATE public.coaches SET coach_number = 3 WHERE id = 'f9a44c8a-31ea-4ca1-8cef-b9049733c5e1'; -- Erick (primeiro registro)

-- Assign sequential numbers to remaining coaches, ordered by created_at then id (deterministic)
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) + 3 AS n
  FROM public.coaches
  WHERE coach_number IS NULL
)
UPDATE public.coaches c
SET coach_number = o.n
FROM ordered o
WHERE c.id = o.id;

-- Unique constraint
ALTER TABLE public.coaches ADD CONSTRAINT coaches_coach_number_key UNIQUE (coach_number);

-- Sequence + trigger to auto-assign on new inserts
CREATE SEQUENCE IF NOT EXISTS public.coach_number_seq;
SELECT setval('public.coach_number_seq', COALESCE((SELECT MAX(coach_number) FROM public.coaches), 0));

CREATE OR REPLACE FUNCTION public.assign_coach_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.coach_number IS NULL THEN
    NEW.coach_number := nextval('public.coach_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_coach_number ON public.coaches;
CREATE TRIGGER trg_assign_coach_number
BEFORE INSERT ON public.coaches
FOR EACH ROW EXECUTE FUNCTION public.assign_coach_number();