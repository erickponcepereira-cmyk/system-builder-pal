ALTER TABLE public.saved_payment_cards
  ADD COLUMN IF NOT EXISTS cardholder_doc text;

ALTER TABLE public.recurring_subscriptions
  ADD COLUMN IF NOT EXISTS pending_charge_id uuid,
  ADD COLUMN IF NOT EXISTS pending_since timestamptz;

COMMENT ON COLUMN public.saved_payment_cards.cardholder_doc IS 'CPF/CNPJ do titular do cartão (pode diferir do comprador).';
COMMENT ON COLUMN public.recurring_subscriptions.pending_charge_id IS 'Cobrança em análise no Mercado Pago aguardando webhook.';