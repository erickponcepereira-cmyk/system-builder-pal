
-- 1) Add 'wallet' to payment_method enum (used by store_orders)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='payment_method'::regtype AND enumlabel='wallet') THEN
    ALTER TYPE payment_method ADD VALUE 'wallet';
  END IF;
END $$;

-- 2) Breakdown columns
ALTER TABLE public.store_orders ADD COLUMN IF NOT EXISTS wallet_debit_breakdown jsonb;
ALTER TABLE public.partner_product_orders ADD COLUMN IF NOT EXISTS wallet_debit_breakdown jsonb;

-- 3) Helper: debit cascade for a given user profile and total amount
CREATE OR REPLACE FUNCTION public.debit_user_wallets_cascade(
  _profile_id uuid,
  _amount numeric,
  _note text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric := _amount;
  v_bal numeric;
  v_take numeric;
  v_partner_id uuid;
  v_coach_id uuid;
  v_breakdown jsonb := '{}'::jsonb;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  -- Lock coach wallet
  SELECT available_balance INTO v_bal FROM public.wallets
    WHERE profile_id = _profile_id FOR UPDATE;
  v_bal := COALESCE(v_bal, 0);
  IF v_bal > 0 AND v_remaining > 0 THEN
    v_take := LEAST(v_bal, v_remaining);
    UPDATE public.wallets
      SET available_balance = available_balance - v_take,
          updated_at = now()
      WHERE profile_id = _profile_id;
    INSERT INTO public.fitcoin_ledger (profile_id, amount, source, description, created_at)
      VALUES (_profile_id, -v_take, 'wallet_debit', COALESCE(_note,'Débito carteira coach'), now())
      ON CONFLICT DO NOTHING;
    v_breakdown := v_breakdown || jsonb_build_object('coach', v_take);
    v_remaining := v_remaining - v_take;
  END IF;

  -- Partner wallet
  IF v_remaining > 0 THEN
    SELECT id INTO v_partner_id FROM public.partners WHERE profile_id = _profile_id LIMIT 1;
    IF v_partner_id IS NOT NULL THEN
      SELECT available_balance INTO v_bal FROM public.partner_wallets
        WHERE partner_id = v_partner_id FOR UPDATE;
      v_bal := COALESCE(v_bal, 0);
      IF v_bal > 0 THEN
        v_take := LEAST(v_bal, v_remaining);
        UPDATE public.partner_wallets
          SET available_balance = available_balance - v_take,
              updated_at = now()
          WHERE partner_id = v_partner_id;
        v_breakdown := v_breakdown || jsonb_build_object('partner', v_take);
        v_remaining := v_remaining - v_take;
      END IF;
    END IF;
  END IF;

  -- Professional wallet
  IF v_remaining > 0 THEN
    SELECT id INTO v_coach_id FROM public.coaches WHERE profile_id = _profile_id LIMIT 1;
    IF v_coach_id IS NOT NULL THEN
      SELECT available_balance INTO v_bal FROM public.professional_wallets
        WHERE professional_coach_id = v_coach_id FOR UPDATE;
      v_bal := COALESCE(v_bal, 0);
      IF v_bal > 0 THEN
        v_take := LEAST(v_bal, v_remaining);
        UPDATE public.professional_wallets
          SET available_balance = available_balance - v_take,
              updated_at = now()
          WHERE professional_coach_id = v_coach_id;
        v_breakdown := v_breakdown || jsonb_build_object('professional', v_take);
        v_remaining := v_remaining - v_take;
      END IF;
    END IF;
  END IF;

  IF v_remaining > 0.01 THEN
    RAISE EXCEPTION 'Saldo insuficiente nas carteiras (faltam R$ %)', to_char(v_remaining, 'FM999999990.00');
  END IF;

  RETURN v_breakdown;
END;
$$;

-- 4) Pay a store order with wallet
CREATE OR REPLACE FUNCTION public.pay_store_order_with_wallet(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_student_id uuid;
  v_total numeric;
  v_status text;
  v_breakdown jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;

  SELECT o.total_amount, o.status, o.student_id
    INTO v_total, v_status, v_student_id
    FROM public.store_orders o WHERE o.id = _order_id FOR UPDATE;
  IF v_total IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF v_status = 'paid' THEN RAISE EXCEPTION 'Pedido já pago'; END IF;

  -- Ownership check
  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_student_id AND s.profile_id = v_profile_id) THEN
    RAISE EXCEPTION 'Sem permissão para este pedido';
  END IF;

  v_breakdown := public.debit_user_wallets_cascade(v_profile_id, v_total, 'Compra na loja (pedido)');

  UPDATE public.store_orders
    SET status = 'paid',
        payment_method = 'wallet'::payment_method,
        paid_at = now(),
        wallet_debit_breakdown = v_breakdown,
        updated_at = now()
    WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'breakdown', v_breakdown);
END;
$$;

-- 5) Pay a partner/professional product order with wallet
CREATE OR REPLACE FUNCTION public.pay_partner_order_with_wallet(_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_student_id uuid;
  v_total numeric;
  v_status text;
  v_breakdown jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;

  SELECT o.gross_amount, o.status, o.student_id
    INTO v_total, v_status, v_student_id
    FROM public.partner_product_orders o WHERE o.id = _order_id FOR UPDATE;
  IF v_total IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF v_status = 'paid' THEN RAISE EXCEPTION 'Pedido já pago'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = v_student_id AND s.profile_id = v_profile_id) THEN
    RAISE EXCEPTION 'Sem permissão para este pedido';
  END IF;

  v_breakdown := public.debit_user_wallets_cascade(v_profile_id, v_total, 'Compra parceiro/profissional (pedido)');

  UPDATE public.partner_product_orders
    SET status = 'paid',
        payment_method = 'wallet',
        paid_at = now(),
        wallet_debit_breakdown = v_breakdown,
        updated_at = now()
    WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'breakdown', v_breakdown);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pay_store_order_with_wallet(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_partner_order_with_wallet(uuid) TO authenticated;
