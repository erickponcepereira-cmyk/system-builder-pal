ALTER TABLE public.product_referral_rules
  ADD COLUMN IF NOT EXISTS is_referral_product boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.product_referral_rules.is_referral_product IS 'Quando ativo, o produto aparece para indicação aluno → aluno.';