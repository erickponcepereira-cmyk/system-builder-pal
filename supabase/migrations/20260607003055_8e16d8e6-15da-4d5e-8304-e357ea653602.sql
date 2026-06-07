ALTER TABLE public.network_unlock_rules
  ADD COLUMN IF NOT EXISTS product_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS patent_levels integer[] NOT NULL DEFAULT '{}'::integer[];