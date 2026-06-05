
-- Remove "network" tab from professional default tabs
UPDATE public.professional_specialties
SET default_tabs = (
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
  FROM jsonb_array_elements(default_tabs) elem
  WHERE elem <> '"network"'::jsonb
)
WHERE default_tabs @> '["network"]'::jsonb;

-- Add specializations tags to professional public profile
ALTER TABLE public.professional_public_profile
  ADD COLUMN IF NOT EXISTS specializations text[] NOT NULL DEFAULT '{}'::text[];
