
-- ============ PRODUCT ORDER POOL (Painel de Pedidos) ============
CREATE TYPE public.order_pool_status AS ENUM ('pending', 'preparing', 'shipped', 'delivered', 'cancelled');

CREATE TABLE public.product_order_pool_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID,
  student_id UUID,
  product_id UUID,
  slot_label TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.order_pool_status NOT NULL DEFAULT 'pending',
  tracking_code TEXT,
  notes TEXT,
  preparing_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_pool_status ON public.product_order_pool_entries(status);
CREATE INDEX idx_order_pool_student ON public.product_order_pool_entries(student_id);
CREATE INDEX idx_order_pool_tx ON public.product_order_pool_entries(transaction_id);

CREATE TRIGGER trg_order_pool_updated
BEFORE UPDATE ON public.product_order_pool_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.product_order_pool_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_pool_admin_all" ON public.product_order_pool_entries
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- ============ NUTRITIONIST WALLET ============
CREATE TABLE public.nutritionist_wallets (
  profile_id UUID PRIMARY KEY,
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  blocked_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_released NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.nutritionist_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nutri_wallet_admin_all" ON public.nutritionist_wallets
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "nutri_wallet_own_select" ON public.nutritionist_wallets
  FOR SELECT USING (profile_id = public.current_profile_id());

CREATE TYPE public.nutri_block_status AS ENUM ('blocked', 'released', 'cancelled');

CREATE TABLE public.nutritionist_blocked_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID,
  profile_id UUID NOT NULL,
  student_id UUID,
  product_id UUID,
  slot_label TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status public.nutri_block_status NOT NULL DEFAULT 'blocked',
  reason TEXT,
  released_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nutri_blocked_status ON public.nutritionist_blocked_entries(status);
CREATE INDEX idx_nutri_blocked_profile ON public.nutritionist_blocked_entries(profile_id);

CREATE TRIGGER trg_nutri_blocked_updated
BEFORE UPDATE ON public.nutritionist_blocked_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.nutritionist_blocked_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nutri_blocked_admin_all" ON public.nutritionist_blocked_entries
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "nutri_blocked_own_select" ON public.nutritionist_blocked_entries
  FOR SELECT USING (profile_id = public.current_profile_id());

-- ============ FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.release_nutritionist_blocked_entry(_entry_id UUID, _notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO e FROM public.nutritionist_blocked_entries WHERE id = _entry_id FOR UPDATE;
  IF e.id IS NULL THEN
    RAISE EXCEPTION 'Entrada não encontrada';
  END IF;
  IF e.status <> 'blocked' THEN
    RAISE EXCEPTION 'Entrada já processada';
  END IF;

  UPDATE public.nutritionist_blocked_entries
  SET status = 'released', released_at = now(), notes = COALESCE(_notes, notes)
  WHERE id = _entry_id;

  INSERT INTO public.nutritionist_wallets (profile_id, available_balance, blocked_balance, total_earned, total_released, updated_at)
  VALUES (e.profile_id, e.amount, 0, e.amount, e.amount, now())
  ON CONFLICT (profile_id) DO UPDATE
  SET available_balance = public.nutritionist_wallets.available_balance + EXCLUDED.available_balance,
      blocked_balance = GREATEST(0, public.nutritionist_wallets.blocked_balance - e.amount),
      total_released = public.nutritionist_wallets.total_released + e.amount,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_nutritionist_blocked_entry(_entry_id UUID, _notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO e FROM public.nutritionist_blocked_entries WHERE id = _entry_id FOR UPDATE;
  IF e.id IS NULL OR e.status <> 'blocked' THEN
    RAISE EXCEPTION 'Entrada inválida';
  END IF;

  UPDATE public.nutritionist_blocked_entries
  SET status = 'cancelled', cancelled_at = now(), notes = COALESCE(_notes, notes)
  WHERE id = _entry_id;

  UPDATE public.nutritionist_wallets
  SET blocked_balance = GREATEST(0, blocked_balance - e.amount), updated_at = now()
  WHERE profile_id = e.profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_order_pool_entry_status(_entry_id UUID, _status public.order_pool_status, _tracking TEXT DEFAULT NULL, _notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.product_order_pool_entries
  SET status = _status,
      tracking_code = COALESCE(_tracking, tracking_code),
      notes = COALESCE(_notes, notes),
      preparing_at = CASE WHEN _status = 'preparing' AND preparing_at IS NULL THEN now() ELSE preparing_at END,
      shipped_at = CASE WHEN _status = 'shipped' AND shipped_at IS NULL THEN now() ELSE shipped_at END,
      delivered_at = CASE WHEN _status = 'delivered' AND delivered_at IS NULL THEN now() ELSE delivered_at END,
      cancelled_at = CASE WHEN _status = 'cancelled' AND cancelled_at IS NULL THEN now() ELSE cancelled_at END
  WHERE id = _entry_id;
END;
$$;
