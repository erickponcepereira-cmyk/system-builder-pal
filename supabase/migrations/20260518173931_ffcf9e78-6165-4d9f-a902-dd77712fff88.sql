
-- Vínculo do parceiro com coach (indicador/selecionado)
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS upline_coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partners_upline_coach ON public.partners(upline_coach_id);

-- Campos financeiros nos produtos do parceiro
ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS price_input_mode varchar(8) NOT NULL DEFAULT 'charge'
    CHECK (price_input_mode IN ('charge','receive')),
  ADD COLUMN IF NOT EXISTS coach_commission_percentage numeric(5,2) NOT NULL DEFAULT 10
    CHECK (coach_commission_percentage IN (10, 20, 30)),
  ADD COLUMN IF NOT EXISTS system_fee_fixed numeric(10,2) NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS tax_percentage numeric(5,2) NOT NULL DEFAULT 6,
  ADD COLUMN IF NOT EXISTS card_fee_percentage numeric(5,2) NOT NULL DEFAULT 4.98,
  ADD COLUMN IF NOT EXISTS pix_fee_percentage numeric(5,2) NOT NULL DEFAULT 0.99,
  ADD COLUMN IF NOT EXISTS partner_net_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coach_commission_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS network_l1_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS network_l2_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS network_l3_amount numeric(10,2) DEFAULT 0;
