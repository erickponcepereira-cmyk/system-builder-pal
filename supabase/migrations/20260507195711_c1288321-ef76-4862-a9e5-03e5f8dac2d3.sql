
-- Tabela única que registra todos os pagamentos Mercado Pago
CREATE TABLE public.mercadopago_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mp_payment_id text UNIQUE,
  mp_preference_id text,
  source_kind text NOT NULL CHECK (source_kind IN ('store_order','transaction')),
  source_id uuid NOT NULL,
  student_id uuid,
  payer_email text,
  payer_name text,
  payer_doc text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  payment_method text NOT NULL CHECK (payment_method IN ('pix','credit_card','debit_card','bank_transfer')),
  status text NOT NULL DEFAULT 'pending',
  status_detail text,
  pix_qr_code text,
  pix_qr_code_base64 text,
  pix_ticket_url text,
  pix_expires_at timestamptz,
  raw_response jsonb DEFAULT '{}'::jsonb,
  raw_webhook jsonb DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_mp_payments_source ON public.mercadopago_payments(source_kind, source_id);
CREATE INDEX idx_mp_payments_status ON public.mercadopago_payments(status);
CREATE INDEX idx_mp_payments_student ON public.mercadopago_payments(student_id);
CREATE INDEX idx_mp_payments_created ON public.mercadopago_payments(created_at DESC);

ALTER TABLE public.mercadopago_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY mp_payments_admin_all ON public.mercadopago_payments
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY mp_payments_student_select ON public.mercadopago_payments
  FOR SELECT USING (
    student_id IN (
      SELECT s.id FROM public.students s
      JOIN public.profiles p ON p.id = s.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE POLICY mp_payments_coach_select ON public.mercadopago_payments
  FOR SELECT USING (
    student_id IN (
      SELECT s.id FROM public.students s
      WHERE s.coach_id IN (
        SELECT c.id FROM public.coaches c
        JOIN public.profiles p ON p.id = c.profile_id
        WHERE p.user_id = auth.uid()
      )
    )
  );

CREATE TRIGGER mp_payments_set_updated
  BEFORE UPDATE ON public.mercadopago_payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Vincular pedidos/transações ao pagamento MP (opcional, para lookup rápido)
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS mp_payment_id uuid REFERENCES public.mercadopago_payments(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS mp_payment_id uuid REFERENCES public.mercadopago_payments(id) ON DELETE SET NULL;
