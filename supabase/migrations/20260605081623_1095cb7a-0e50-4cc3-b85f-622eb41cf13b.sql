ALTER TABLE public.students ADD COLUMN IF NOT EXISTS is_influencer boolean NOT NULL DEFAULT false;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS influencer_promoted_at timestamptz;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS influencer_promoted_by uuid;