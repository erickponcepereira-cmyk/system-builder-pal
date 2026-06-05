ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS redemption_mode text NOT NULL DEFAULT 'free'
  CHECK (redemption_mode IN ('free', 'discount'));

COMMENT ON COLUMN public.partner_products.redemption_mode IS
  'When kind=free: free = produto/serviço gratuito sem custo; discount = cupom de desconto sobre preço normal.';