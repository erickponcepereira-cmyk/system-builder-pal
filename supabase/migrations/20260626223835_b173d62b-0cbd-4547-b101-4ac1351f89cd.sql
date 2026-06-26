ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS already_partner boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.partners.already_partner IS 'Autodeclaração no cadastro: usuário marcou que já era parceiro (pula cobrança da anuidade).';