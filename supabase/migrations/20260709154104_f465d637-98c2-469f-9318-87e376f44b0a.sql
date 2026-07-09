
ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS uses_scheduling boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS weekly_limit_per_student integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS redemption_location_name text,
  ADD COLUMN IF NOT EXISTS redemption_location_url text;

ALTER TABLE public.store_sections
  ADD COLUMN IF NOT EXISTS target_audiences text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.store_sections
  SET target_audiences = ARRAY[target_audience]
  WHERE target_audience IS NOT NULL
    AND (target_audiences IS NULL OR array_length(target_audiences, 1) IS NULL);
