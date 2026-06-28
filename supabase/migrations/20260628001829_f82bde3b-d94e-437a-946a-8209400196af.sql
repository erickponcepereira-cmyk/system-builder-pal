ALTER TABLE public.coaches DROP CONSTRAINT IF EXISTS coaches_activation_source_check;
ALTER TABLE public.coaches ADD CONSTRAINT coaches_activation_source_check
  CHECK (activation_source = ANY (ARRAY['purchased'::text, 'already_coach'::text, 'already_professional'::text, 'already_partner'::text, 'admin_grant'::text]));