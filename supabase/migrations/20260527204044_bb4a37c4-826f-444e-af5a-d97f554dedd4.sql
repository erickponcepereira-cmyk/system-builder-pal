
-- 1. Tabela de baixas manuais de taxas/impostos
CREATE TABLE IF NOT EXISTS public.system_fee_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('tax','payment_fee')),
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_by UUID REFERENCES public.profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (transaction_id, kind)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_fee_payouts TO authenticated;
GRANT ALL ON public.system_fee_payouts TO service_role;

ALTER TABLE public.system_fee_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sfp_admin_all" ON public.system_fee_payouts
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 2. Adiciona valor 'paid' ao enum nutri_block_status (se ainda não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'nutri_block_status' AND e.enumlabel = 'paid'
  ) THEN
    ALTER TYPE nutri_block_status ADD VALUE 'paid';
  END IF;
END$$;

-- 3. Função: pagar disponível da nutricionista
CREATE OR REPLACE FUNCTION public.pay_nutritionist_available(_profile_id UUID, _notes TEXT DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin UUID;
  v_amount NUMERIC := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE user_id = auth.uid();

  SELECT COALESCE(SUM(amount),0) INTO v_amount
  FROM public.nutritionist_blocked_entries
  WHERE profile_id = _profile_id AND status = 'released';

  IF v_amount <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.nutritionist_blocked_entries
  SET status = 'paid', released_at = COALESCE(released_at, NOW()), updated_at = NOW(),
      notes = COALESCE(notes,'') || CASE WHEN _notes IS NOT NULL THEN E'\n[admin pay] '||_notes ELSE '' END
  WHERE profile_id = _profile_id AND status = 'released';

  UPDATE public.nutritionist_wallets
  SET available_balance = 0,
      total_withdrawn = COALESCE(total_withdrawn,0) + v_amount,
      updated_at = NOW()
  WHERE profile_id = _profile_id;

  -- Histórico unificado: registra como withdrawal_request paga
  INSERT INTO public.withdrawal_requests (profile_id, amount, status, requested_at, approved_at, paid_at, approved_by, notes)
  VALUES (_profile_id, v_amount, 'paid', NOW(), NOW(), NOW(), v_admin, COALESCE(_notes,'Baixa nutricionista via painel financeiro'));

  RETURN v_amount;
END;
$$;

-- 4. Função: pagar disponível de coach (slot vendedor / próprio coach)
CREATE OR REPLACE FUNCTION public.pay_coach_available(_profile_id UUID, _kind TEXT DEFAULT 'coach', _notes TEXT DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin UUID;
  v_amount NUMERIC := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE user_id = auth.uid();

  IF _kind = 'network' THEN
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(level,0) > 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

    IF v_amount <= 0 THEN RETURN 0; END IF;

    UPDATE public.commissions
    SET status = 'paid'
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(level,0) > 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';
  ELSE
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

    IF v_amount <= 0 THEN RETURN 0; END IF;

    UPDATE public.commissions
    SET status = 'paid'
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';
  END IF;

  UPDATE public.wallets
  SET available_balance = GREATEST(0, COALESCE(available_balance,0) - v_amount),
      total_withdrawn = COALESCE(total_withdrawn,0) + v_amount,
      updated_at = NOW()
  WHERE profile_id = _profile_id;

  INSERT INTO public.withdrawal_requests (profile_id, amount, status, requested_at, approved_at, paid_at, approved_by, notes)
  VALUES (_profile_id, v_amount, 'paid', NOW(), NOW(), NOW(), v_admin,
          COALESCE(_notes, CASE WHEN _kind='network' THEN 'Baixa rede via painel financeiro' ELSE 'Baixa coach via painel financeiro' END));

  RETURN v_amount;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_nutritionist_available(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pay_nutritionist_available(UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.pay_coach_available(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pay_coach_available(UUID, TEXT, TEXT) TO authenticated, service_role;
