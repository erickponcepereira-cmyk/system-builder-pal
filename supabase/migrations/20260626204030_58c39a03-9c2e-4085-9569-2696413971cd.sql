-- Campos para liberação por etapas de parceiros (espelhando coaches)
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS activation_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS activation_source text,
  ADD COLUMN IF NOT EXISTS activation_granted_by uuid,
  ADD COLUMN IF NOT EXISTS activation_note text,
  ADD COLUMN IF NOT EXISTS documents_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS documents_reviewed_by uuid;

COMMENT ON COLUMN public.partners.activation_source IS 'purchased | already_coach | admin_grant | partner_approved | mercadopago';
