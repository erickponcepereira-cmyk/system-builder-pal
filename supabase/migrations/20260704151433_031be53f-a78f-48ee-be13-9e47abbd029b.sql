-- ============================================================
-- Fase 2: Política de liberação financeira
-- ============================================================

-- Enum de status de liberação
DO $$ BEGIN
  CREATE TYPE public.release_status_type AS ENUM ('pending','released','blocked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Eventos permitidos (CHECK, não enum, para permitir extensão futura)
-- Valores válidos: access_released | delivered | service_completed
--                  | course_access_released | subscription_cycle | paid

-- ─── store_orders ───
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_base_event TEXT,
  ADD COLUMN IF NOT EXISTS release_base_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_days INT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_status public.release_status_type NOT NULL DEFAULT 'pending';

-- ─── partner_product_orders ───
ALTER TABLE public.partner_product_orders
  ADD COLUMN IF NOT EXISTS release_base_event TEXT,
  ADD COLUMN IF NOT EXISTS release_base_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_days INT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_status public.release_status_type NOT NULL DEFAULT 'pending';

-- ─── transactions ───
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS release_base_event TEXT,
  ADD COLUMN IF NOT EXISTS release_base_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_days INT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_status public.release_status_type NOT NULL DEFAULT 'pending';

-- ─── subscription_invoices ───
-- (release_days configurável por ciclo; default 7 para consistência)
ALTER TABLE public.subscription_invoices
  ADD COLUMN IF NOT EXISTS release_base_event TEXT,
  ADD COLUMN IF NOT EXISTS release_base_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_days INT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS release_status public.release_status_type NOT NULL DEFAULT 'pending';

-- CHECK constraint para release_base_event em cada tabela
DO $$ BEGIN
  ALTER TABLE public.store_orders ADD CONSTRAINT store_orders_release_base_event_chk
    CHECK (release_base_event IS NULL OR release_base_event IN
      ('access_released','delivered','service_completed','course_access_released','subscription_cycle','paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.partner_product_orders ADD CONSTRAINT ppo_release_base_event_chk
    CHECK (release_base_event IS NULL OR release_base_event IN
      ('access_released','delivered','service_completed','course_access_released','subscription_cycle','paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.transactions ADD CONSTRAINT transactions_release_base_event_chk
    CHECK (release_base_event IS NULL OR release_base_event IN
      ('access_released','delivered','service_completed','course_access_released','subscription_cycle','paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.subscription_invoices ADD CONSTRAINT si_release_base_event_chk
    CHECK (release_base_event IS NULL OR release_base_event IN
      ('access_released','delivered','service_completed','course_access_released','subscription_cycle','paid'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Índices para consultas de "o que já pode ser liberado?"
CREATE INDEX IF NOT EXISTS idx_store_orders_release ON public.store_orders(release_status, available_at);
CREATE INDEX IF NOT EXISTS idx_ppo_release ON public.partner_product_orders(release_status, available_at);
CREATE INDEX IF NOT EXISTS idx_transactions_release ON public.transactions(release_status, available_at);
CREATE INDEX IF NOT EXISTS idx_si_release ON public.subscription_invoices(release_status, available_at);

-- ============================================================
-- Trigger: sempre que release_base_at é setado, calcula available_at
-- e libera automaticamente se o tempo já passou.
-- Não sobrescreve release_status='blocked' (bloqueio manual/devolução).
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_order_release_policy()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.release_base_at IS NOT NULL THEN
    NEW.available_at := NEW.release_base_at + (COALESCE(NEW.release_days, 7) || ' days')::interval;
    IF NEW.release_status <> 'blocked' THEN
      IF NEW.available_at <= now() THEN
        NEW.release_status := 'released';
      ELSE
        NEW.release_status := 'pending';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_release_policy_store_orders ON public.store_orders;
CREATE TRIGGER trg_release_policy_store_orders
  BEFORE INSERT OR UPDATE OF release_base_at, release_days, release_status
  ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_release_policy();

DROP TRIGGER IF EXISTS trg_release_policy_ppo ON public.partner_product_orders;
CREATE TRIGGER trg_release_policy_ppo
  BEFORE INSERT OR UPDATE OF release_base_at, release_days, release_status
  ON public.partner_product_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_release_policy();

DROP TRIGGER IF EXISTS trg_release_policy_transactions ON public.transactions;
CREATE TRIGGER trg_release_policy_transactions
  BEFORE INSERT OR UPDATE OF release_base_at, release_days, release_status
  ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.set_order_release_policy();

DROP TRIGGER IF EXISTS trg_release_policy_si ON public.subscription_invoices;
CREATE TRIGGER trg_release_policy_si
  BEFORE INSERT OR UPDATE OF release_base_at, release_days, release_status
  ON public.subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_order_release_policy();

-- ============================================================
-- Helper público: mark_release_event
-- App chama isso quando um evento de liberação acontece
-- (acesso digital liberado, físico entregue, consulta concluída, etc)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_release_event(
  _source_kind TEXT,
  _source_id UUID,
  _event TEXT,
  _event_at TIMESTAMPTZ DEFAULT now(),
  _release_days INT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _event NOT IN ('access_released','delivered','service_completed','course_access_released','subscription_cycle','paid') THEN
    RAISE EXCEPTION 'invalid release event: %', _event;
  END IF;

  IF _source_kind = 'store_order' THEN
    UPDATE public.store_orders SET
      release_base_event = _event,
      release_base_at    = _event_at,
      release_days       = COALESCE(_release_days, release_days, 7)
    WHERE id = _source_id;
  ELSIF _source_kind = 'partner_product_order' THEN
    UPDATE public.partner_product_orders SET
      release_base_event = _event,
      release_base_at    = _event_at,
      release_days       = COALESCE(_release_days, release_days, 7)
    WHERE id = _source_id;
  ELSIF _source_kind = 'transaction' THEN
    UPDATE public.transactions SET
      release_base_event = _event,
      release_base_at    = _event_at,
      release_days       = COALESCE(_release_days, release_days, 7)
    WHERE id = _source_id;
  ELSIF _source_kind = 'subscription_invoice' THEN
    UPDATE public.subscription_invoices SET
      release_base_event = _event,
      release_base_at    = _event_at,
      release_days       = COALESCE(_release_days, release_days, 7)
    WHERE id = _source_id;
  ELSE
    RAISE EXCEPTION 'invalid source_kind: %', _source_kind;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_release_event(TEXT, UUID, TEXT, TIMESTAMPTZ, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_release_event(TEXT, UUID, TEXT, TIMESTAMPTZ, INT) TO service_role;

-- ============================================================
-- Backfill histórico (fallback paid_at conforme escolhido)
-- ============================================================

-- store_orders: preencher paid_at retroativamente com updated_at para pedidos pagos
UPDATE public.store_orders
SET paid_at = updated_at
WHERE status = 'paid' AND paid_at IS NULL;

-- Backfill de release em store_orders
UPDATE public.store_orders
SET release_base_event = 'paid',
    release_base_at    = COALESCE(paid_at, updated_at, created_at),
    release_days       = 7,
    available_at       = COALESCE(paid_at, updated_at, created_at) + interval '7 days',
    release_status     = CASE
      WHEN COALESCE(paid_at, updated_at, created_at) + interval '7 days' <= now() THEN 'released'::public.release_status_type
      ELSE 'pending'::public.release_status_type
    END
WHERE status = 'paid' AND release_base_event IS NULL;

-- partner_product_orders
UPDATE public.partner_product_orders
SET release_base_event = 'paid',
    release_base_at    = COALESCE(paid_at, updated_at, created_at),
    release_days       = 7,
    available_at       = COALESCE(paid_at, updated_at, created_at) + interval '7 days',
    release_status     = CASE
      WHEN COALESCE(paid_at, updated_at, created_at) + interval '7 days' <= now() THEN 'released'::public.release_status_type
      ELSE 'pending'::public.release_status_type
    END
WHERE status = 'paid' AND release_base_event IS NULL;

-- transactions
UPDATE public.transactions
SET release_base_event = 'paid',
    release_base_at    = COALESCE(paid_at, created_at),
    release_days       = 7,
    available_at       = COALESCE(paid_at, created_at) + interval '7 days',
    release_status     = CASE
      WHEN COALESCE(paid_at, created_at) + interval '7 days' <= now() THEN 'released'::public.release_status_type
      ELSE 'pending'::public.release_status_type
    END
WHERE status = 'paid' AND release_base_event IS NULL;

-- subscription_invoices
UPDATE public.subscription_invoices
SET release_base_event = 'subscription_cycle',
    release_base_at    = COALESCE(paid_at, updated_at, created_at),
    release_days       = 7,
    available_at       = COALESCE(paid_at, updated_at, created_at) + interval '7 days',
    release_status     = CASE
      WHEN COALESCE(paid_at, updated_at, created_at) + interval '7 days' <= now() THEN 'released'::public.release_status_type
      ELSE 'pending'::public.release_status_type
    END
WHERE status = 'paid' AND release_base_event IS NULL;
