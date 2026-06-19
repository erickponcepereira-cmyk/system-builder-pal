
-- ============ 1. Settings: 7 dias padrão ============
UPDATE public.app_settings SET value = '7' WHERE key = 'commission_release_days';
UPDATE public.app_settings SET value = '7' WHERE key = 'commission_release_referral_days';

-- ============ 2. Fitcoin schema ============
ALTER TABLE public.student_wallets
  ADD COLUMN IF NOT EXISTS fitcoin_balance NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS fitcoin_credited BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS fitcoin_used NUMERIC(12,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.fitcoin_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  commission_id UUID REFERENCES public.commissions(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.store_orders(id) ON DELETE SET NULL,
  balance_after NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fitcoin_ledger TO authenticated;
GRANT ALL ON public.fitcoin_ledger TO service_role;

ALTER TABLE public.fitcoin_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fitcoin_ledger_admin_all" ON public.fitcoin_ledger
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "fitcoin_ledger_own_select" ON public.fitcoin_ledger
  FOR SELECT USING (student_id IN (
    SELECT s.id FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid()
  ));

CREATE INDEX IF NOT EXISTS idx_fitcoin_ledger_student ON public.fitcoin_ledger(student_id, created_at DESC);

-- ============ 3. Trigger: comissão de indicação => Fitcoin ============
CREATE OR REPLACE FUNCTION public.commissions_redirect_to_fitcoin_before()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.is_referral, false) = true AND NEW.referred_by_student_id IS NOT NULL THEN
    NEW.status := 'paid';
    NEW.available_at := COALESCE(NEW.available_at, now());
    NEW.fitcoin_credited := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.commissions_credit_fitcoin_after()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_new_balance NUMERIC(12,2);
BEGIN
  IF COALESCE(NEW.is_referral, false) = true AND NEW.referred_by_student_id IS NOT NULL THEN
    INSERT INTO public.student_wallets (student_id, fitcoin_balance, updated_at)
    VALUES (NEW.referred_by_student_id, NEW.amount, now())
    ON CONFLICT (student_id) DO UPDATE
      SET fitcoin_balance = public.student_wallets.fitcoin_balance + EXCLUDED.fitcoin_balance,
          updated_at = now()
    RETURNING fitcoin_balance INTO v_new_balance;

    INSERT INTO public.fitcoin_ledger (student_id, amount, reason, commission_id, balance_after)
    VALUES (NEW.referred_by_student_id, NEW.amount, 'referral_earned', NEW.id, COALESCE(v_new_balance, NEW.amount));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_redirect_fitcoin_before ON public.commissions;
CREATE TRIGGER trg_commissions_redirect_fitcoin_before
  BEFORE INSERT ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.commissions_redirect_to_fitcoin_before();

DROP TRIGGER IF EXISTS trg_commissions_credit_fitcoin_after ON public.commissions;
CREATE TRIGGER trg_commissions_credit_fitcoin_after
  AFTER INSERT ON public.commissions
  FOR EACH ROW EXECUTE FUNCTION public.commissions_credit_fitcoin_after();

-- ============ 4. Backfill: converter comissões existentes em Fitcoin ============
DO $$
DECLARE
  r RECORD;
  v_bal NUMERIC(12,2);
BEGIN
  FOR r IN
    SELECT id, referred_by_student_id, amount
    FROM public.commissions
    WHERE COALESCE(is_referral, false) = true
      AND referred_by_student_id IS NOT NULL
      AND COALESCE(fitcoin_credited, false) = false
      AND status::text IN ('pending','available')
  LOOP
    INSERT INTO public.student_wallets (student_id, fitcoin_balance, updated_at)
    VALUES (r.referred_by_student_id, r.amount, now())
    ON CONFLICT (student_id) DO UPDATE
      SET fitcoin_balance = public.student_wallets.fitcoin_balance + EXCLUDED.fitcoin_balance,
          updated_at = now()
    RETURNING fitcoin_balance INTO v_bal;

    INSERT INTO public.fitcoin_ledger (student_id, amount, reason, commission_id, balance_after)
    VALUES (r.referred_by_student_id, r.amount, 'backfill_referral', r.id, COALESCE(v_bal, r.amount));

    UPDATE public.commissions
      SET status = 'paid', fitcoin_credited = TRUE, available_at = COALESCE(available_at, now())
      WHERE id = r.id;
  END LOOP;
END $$;

-- Recompute student_wallets (zera saldo em dinheiro de indicação)
DO $$
DECLARE s RECORD;
BEGIN
  FOR s IN SELECT DISTINCT id FROM public.students WHERE id IN (
    SELECT student_id FROM public.student_wallets
  ) LOOP
    PERFORM public.recalc_student_wallet_for_referral(s.id);
  END LOOP;
END $$;

-- ============ 5. Liberar comissões já vencidas (backlog) ============
UPDATE public.commissions
SET status = 'available'
WHERE status = 'pending'
  AND available_at IS NOT NULL
  AND available_at <= now();

-- Recompute wallets afetados
INSERT INTO public.wallets (profile_id, available_balance, pending_balance, total_earned, updated_at)
SELECT beneficiary_profile_id,
       COALESCE(SUM(amount) FILTER (WHERE status::text = 'available'), 0),
       COALESCE(SUM(amount) FILTER (WHERE status::text = 'pending'), 0),
       COALESCE(SUM(amount) FILTER (WHERE status::text IN ('available','withdrawn','paid')), 0),
       now()
FROM public.commissions
WHERE COALESCE(is_referral, false) = false
GROUP BY beneficiary_profile_id
ON CONFLICT (profile_id) DO UPDATE
SET available_balance = EXCLUDED.available_balance,
    pending_balance = EXCLUDED.pending_balance,
    total_earned = EXCLUDED.total_earned,
    updated_at = now();

-- ============ 6. Cron: liberação automática diária ============
CREATE OR REPLACE FUNCTION public.release_due_commissions_cron()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changed_count INTEGER;
BEGIN
  UPDATE public.commissions
  SET status = 'available'
  WHERE status = 'pending'
    AND available_at IS NOT NULL
    AND available_at <= now();
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  INSERT INTO public.wallets (profile_id, available_balance, pending_balance, total_earned, updated_at)
  SELECT beneficiary_profile_id,
         COALESCE(SUM(amount) FILTER (WHERE status::text = 'available'), 0),
         COALESCE(SUM(amount) FILTER (WHERE status::text = 'pending'), 0),
         COALESCE(SUM(amount) FILTER (WHERE status::text IN ('available','withdrawn','paid')), 0),
         now()
  FROM public.commissions
  WHERE COALESCE(is_referral, false) = false
  GROUP BY beneficiary_profile_id
  ON CONFLICT (profile_id) DO UPDATE
  SET available_balance = EXCLUDED.available_balance,
      pending_balance = EXCLUDED.pending_balance,
      total_earned = EXCLUDED.total_earned,
      updated_at = now();

  RETURN changed_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_due_commissions_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_due_commissions_cron() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$ BEGIN
  PERFORM cron.unschedule('release-due-commissions-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'release-due-commissions-daily',
  '0 3 * * *',
  $cron$ SELECT public.release_due_commissions_cron(); $cron$
);
