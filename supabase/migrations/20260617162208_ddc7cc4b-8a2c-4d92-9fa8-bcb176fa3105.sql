ALTER TABLE public.mercadopago_payments DROP CONSTRAINT IF EXISTS mercadopago_payments_source_kind_check;
ALTER TABLE public.mercadopago_payments ADD CONSTRAINT mercadopago_payments_source_kind_check
  CHECK (source_kind = ANY (ARRAY['store_order'::text, 'transaction'::text, 'partner_product_order'::text, 'subscription_invoice'::text]));