DO $$ BEGIN
  CREATE TYPE public.return_request_status AS ENUM
    ('requested','under_review','approved','rejected','refunded','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.return_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL,
  order_type TEXT NOT NULL CHECK (order_type IN
    ('store_order','partner_product_order','transaction','subscription_invoice')),
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  description TEXT,
  status public.return_request_status NOT NULL DEFAULT 'requested',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id),
  refund_amount NUMERIC(12,2),
  blocks_settlement BOOLEAN NOT NULL DEFAULT true,
  admin_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_return_requests_order ON public.return_requests(order_type, order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_open  ON public.return_requests(order_type, order_id) WHERE status IN ('requested','under_review','approved');
CREATE INDEX IF NOT EXISTS idx_return_requests_requester ON public.return_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_return_requests_status ON public.return_requests(status);

GRANT SELECT, INSERT, UPDATE ON public.return_requests TO authenticated;
GRANT ALL ON public.return_requests TO service_role;

ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "requester can view own returns" ON public.return_requests
  FOR SELECT TO authenticated
  USING (requested_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "requester can create own returns" ON public.return_requests
  FOR INSERT TO authenticated
  WITH CHECK (requested_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "requester can cancel own returns" ON public.return_requests
  FOR UPDATE TO authenticated
  USING (requested_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (requested_by IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "admins manage returns" ON public.return_requests
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'::public.user_role))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'::public.user_role));

CREATE OR REPLACE FUNCTION public.tg_return_requests_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_return_requests_updated_at ON public.return_requests;
CREATE TRIGGER trg_return_requests_updated_at
  BEFORE UPDATE ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.tg_return_requests_updated_at();

-- Helper: existe devolução em aberto que bloqueia repasse?
CREATE OR REPLACE FUNCTION public.has_open_return_request(_order_type TEXT, _order_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.return_requests
    WHERE order_type = _order_type
      AND order_id = _order_id
      AND blocks_settlement = true
      AND status IN ('requested','under_review','approved')
  );
$$;
REVOKE ALL ON FUNCTION public.has_open_return_request(TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_open_return_request(TEXT, UUID) TO authenticated, service_role;

-- Trigger: sincroniza release_status do pedido com devoluções abertas
CREATE OR REPLACE FUNCTION public.sync_release_status_from_returns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _blocks BOOLEAN;
  _still_open BOOLEAN;
BEGIN
  _blocks := COALESCE(NEW.blocks_settlement, false)
             AND NEW.status IN ('requested','under_review','approved');

  IF _blocks THEN
    IF NEW.order_type = 'store_order' THEN
      UPDATE public.store_orders SET release_status = 'blocked' WHERE id = NEW.order_id;
    ELSIF NEW.order_type = 'partner_product_order' THEN
      UPDATE public.partner_product_orders SET release_status = 'blocked' WHERE id = NEW.order_id;
    ELSIF NEW.order_type = 'transaction' THEN
      UPDATE public.transactions SET release_status = 'blocked' WHERE id = NEW.order_id;
    ELSIF NEW.order_type = 'subscription_invoice' THEN
      UPDATE public.subscription_invoices SET release_status = 'blocked' WHERE id = NEW.order_id;
    END IF;
    RETURN NEW;
  END IF;

  SELECT public.has_open_return_request(NEW.order_type, NEW.order_id) INTO _still_open;
  IF _still_open THEN
    RETURN NEW;
  END IF;

  -- Recalcula release_status via trigger existente (set_order_release_policy)
  IF NEW.order_type = 'store_order' THEN
    UPDATE public.store_orders SET release_status = 'pending', release_base_at = release_base_at WHERE id = NEW.order_id;
  ELSIF NEW.order_type = 'partner_product_order' THEN
    UPDATE public.partner_product_orders SET release_status = 'pending', release_base_at = release_base_at WHERE id = NEW.order_id;
  ELSIF NEW.order_type = 'transaction' THEN
    UPDATE public.transactions SET release_status = 'pending', release_base_at = release_base_at WHERE id = NEW.order_id;
  ELSIF NEW.order_type = 'subscription_invoice' THEN
    UPDATE public.subscription_invoices SET release_status = 'pending', release_base_at = release_base_at WHERE id = NEW.order_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_release_from_returns ON public.return_requests;
CREATE TRIGGER trg_sync_release_from_returns
  AFTER INSERT OR UPDATE OF status, blocks_settlement
  ON public.return_requests
  FOR EACH ROW EXECUTE FUNCTION public.sync_release_status_from_returns();
