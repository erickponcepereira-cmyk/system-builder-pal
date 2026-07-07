
-- 1) Ledger of co-production credits materialized when an order is paid
CREATE TABLE IF NOT EXISTS public.product_coproduction_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.partner_product_orders(id) ON DELETE CASCADE,
  coproduction_id uuid NOT NULL REFERENCES public.product_coproductions(id) ON DELETE CASCADE,
  collaborator_type text NOT NULL CHECK (collaborator_type IN ('partner','professional')),
  collaborator_id uuid NOT NULL,
  amount_brl numeric(12,2) NOT NULL CHECK (amount_brl >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, coproduction_id)
);
CREATE INDEX IF NOT EXISTS idx_coprod_credits_collab ON public.product_coproduction_credits (collaborator_type, collaborator_id);
CREATE INDEX IF NOT EXISTS idx_coprod_credits_order ON public.product_coproduction_credits (order_id);

GRANT SELECT ON public.product_coproduction_credits TO authenticated;
GRANT ALL ON public.product_coproduction_credits TO service_role;

ALTER TABLE public.product_coproduction_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coprod credits admin all"
  ON public.product_coproduction_credits FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "coprod credits collaborator read"
  ON public.product_coproduction_credits FOR SELECT TO authenticated
  USING (
    (collaborator_type = 'partner' AND EXISTS (
      SELECT 1 FROM public.partners p JOIN public.profiles pr ON pr.id = p.profile_id
      WHERE p.id = collaborator_id AND pr.user_id = auth.uid()
    ))
    OR (collaborator_type = 'professional' AND EXISTS (
      SELECT 1 FROM public.coaches c JOIN public.profiles pr ON pr.id = c.profile_id
      WHERE c.id = collaborator_id AND pr.user_id = auth.uid()
    ))
  );

-- 2) Trigger: on order becoming paid, materialize credits from accepted co-productions
CREATE OR REPLACE FUNCTION public.apply_coproduction_credits_on_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product_type text;
  v_product_id uuid;
  r record;
BEGIN
  IF NEW.status IS DISTINCT FROM 'paid' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'paid' THEN RETURN NEW; END IF;

  IF NEW.partner_product_id IS NOT NULL THEN
    v_product_type := 'partner';
    v_product_id := NEW.partner_product_id;
  ELSIF NEW.professional_product_id IS NOT NULL THEN
    v_product_type := 'professional';
    v_product_id := NEW.professional_product_id;
  ELSE
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT id, collaborator_type, collaborator_id, fixed_amount_brl
    FROM public.product_coproductions
    WHERE product_type = v_product_type
      AND product_id = v_product_id
      AND status = 'accepted'
      AND fixed_amount_brl > 0
  LOOP
    INSERT INTO public.product_coproduction_credits (order_id, coproduction_id, collaborator_type, collaborator_id, amount_brl)
    VALUES (NEW.id, r.id, r.collaborator_type, r.collaborator_id, r.fixed_amount_brl)
    ON CONFLICT (order_id, coproduction_id) DO NOTHING;

    IF r.collaborator_type = 'partner' THEN
      PERFORM public.recalc_partner_wallet(r.collaborator_id);
    ELSE
      PERFORM public.recalc_professional_wallet(r.collaborator_id);
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_coprod_credits ON public.partner_product_orders;
CREATE TRIGGER trg_apply_coprod_credits
AFTER INSERT OR UPDATE OF status ON public.partner_product_orders
FOR EACH ROW EXECUTE FUNCTION public.apply_coproduction_credits_on_order();

-- 3) Wallet recalcs net out coproduction (seller sends, collaborator receives)
CREATE OR REPLACE FUNCTION public.recalc_partner_wallet(_partner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total numeric := 0;
  v_withdrawn numeric := 0;
BEGIN
  IF _partner_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(total_withdrawn, 0) INTO v_withdrawn
    FROM public.partner_wallets WHERE partner_id = _partner_id;
  v_withdrawn := COALESCE(v_withdrawn, 0);

  WITH own_orders AS (
    SELECT ppo.paid_at, ppo.created_at,
      ppo.partner_net_amount
        - COALESCE((SELECT SUM(c.amount_brl) FROM public.product_coproduction_credits c WHERE c.order_id = ppo.id), 0) AS net_amt
    FROM public.partner_product_orders ppo
    WHERE ppo.partner_id = _partner_id AND ppo.status = 'paid'
  ),
  collab_credits AS (
    SELECT c.amount_brl AS net_amt, ppo.paid_at, ppo.created_at
    FROM public.product_coproduction_credits c
    JOIN public.partner_product_orders ppo ON ppo.id = c.order_id
    WHERE c.collaborator_type = 'partner'
      AND c.collaborator_id = _partner_id
      AND ppo.status = 'paid'
  ),
  all_flow AS (
    SELECT net_amt, paid_at, created_at FROM own_orders
    UNION ALL
    SELECT net_amt, paid_at, created_at FROM collab_credits
  )
  SELECT
    COALESCE(SUM(net_amt) FILTER (WHERE COALESCE(paid_at, created_at) + interval '7 days' > now()), 0),
    COALESCE(SUM(net_amt) FILTER (WHERE COALESCE(paid_at, created_at) + interval '7 days' <= now()), 0),
    COALESCE(SUM(net_amt), 0)
  INTO v_pending, v_available, v_total
  FROM all_flow;

  INSERT INTO public.partner_wallets (partner_id, pending_balance, available_balance, total_earned, total_withdrawn, updated_at)
  VALUES (_partner_id, GREATEST(0, v_pending), GREATEST(0, v_available - v_withdrawn), GREATEST(0, v_total), v_withdrawn, now())
  ON CONFLICT (partner_id) DO UPDATE
    SET pending_balance = EXCLUDED.pending_balance,
        available_balance = EXCLUDED.available_balance,
        total_earned = EXCLUDED.total_earned,
        updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_professional_wallet(_professional_coach_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total numeric := 0;
  v_withdrawn numeric := 0;
BEGIN
  IF _professional_coach_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(total_withdrawn, 0) INTO v_withdrawn
    FROM public.professional_wallets WHERE professional_coach_id = _professional_coach_id;
  v_withdrawn := COALESCE(v_withdrawn, 0);

  WITH own_orders AS (
    SELECT ppo.paid_at, ppo.created_at,
      ppo.partner_net_amount
        - COALESCE((SELECT SUM(c.amount_brl) FROM public.product_coproduction_credits c WHERE c.order_id = ppo.id), 0) AS net_amt
    FROM public.partner_product_orders ppo
    WHERE ppo.professional_coach_id = _professional_coach_id AND ppo.status = 'paid'
  ),
  collab_credits AS (
    SELECT c.amount_brl AS net_amt, ppo.paid_at, ppo.created_at
    FROM public.product_coproduction_credits c
    JOIN public.partner_product_orders ppo ON ppo.id = c.order_id
    WHERE c.collaborator_type = 'professional'
      AND c.collaborator_id = _professional_coach_id
      AND ppo.status = 'paid'
  ),
  all_flow AS (
    SELECT net_amt, paid_at, created_at FROM own_orders
    UNION ALL
    SELECT net_amt, paid_at, created_at FROM collab_credits
  )
  SELECT
    COALESCE(SUM(net_amt) FILTER (WHERE COALESCE(paid_at, created_at) + interval '7 days' > now()), 0),
    COALESCE(SUM(net_amt) FILTER (WHERE COALESCE(paid_at, created_at) + interval '7 days' <= now()), 0),
    COALESCE(SUM(net_amt), 0)
  INTO v_pending, v_available, v_total
  FROM all_flow;

  INSERT INTO public.professional_wallets (professional_coach_id, pending_balance, available_balance, total_earned, total_withdrawn, updated_at)
  VALUES (_professional_coach_id, GREATEST(0, v_pending), GREATEST(0, v_available - v_withdrawn), GREATEST(0, v_total), v_withdrawn, now())
  ON CONFLICT (professional_coach_id) DO UPDATE
    SET pending_balance = EXCLUDED.pending_balance,
        available_balance = EXCLUDED.available_balance,
        total_earned = EXCLUDED.total_earned,
        updated_at = now();
END;
$$;

-- 4) Backfill for orders that were already paid before this feature
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT ppo.id AS order_id,
      CASE WHEN ppo.partner_product_id IS NOT NULL THEN 'partner' ELSE 'professional' END AS ptype,
      COALESCE(ppo.partner_product_id, ppo.professional_product_id) AS pid
    FROM public.partner_product_orders ppo
    WHERE ppo.status = 'paid'
      AND (ppo.partner_product_id IS NOT NULL OR ppo.professional_product_id IS NOT NULL)
  LOOP
    INSERT INTO public.product_coproduction_credits (order_id, coproduction_id, collaborator_type, collaborator_id, amount_brl)
    SELECT r.order_id, cop.id, cop.collaborator_type, cop.collaborator_id, cop.fixed_amount_brl
    FROM public.product_coproductions cop
    WHERE cop.product_type = r.ptype
      AND cop.product_id = r.pid
      AND cop.status = 'accepted'
      AND cop.fixed_amount_brl > 0
    ON CONFLICT (order_id, coproduction_id) DO NOTHING;
  END LOOP;
END $$;
