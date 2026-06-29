CREATE OR REPLACE FUNCTION public.recalc_student_wallet_for_referral(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile uuid;
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total_earned numeric := 0;
  v_fitcoin numeric := 0;
BEGIN
  IF _student_id IS NULL THEN RETURN; END IF;

  SELECT profile_id INTO v_profile FROM public.students WHERE id = _student_id;
  IF v_profile IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'pending'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status::text IN ('available','paid')), 0),
    COALESCE(SUM(amount) FILTER (WHERE status::text <> 'cancelled'), 0)
  INTO v_pending, v_available, v_total_earned
  FROM public.commissions
  WHERE referred_by_student_id = _student_id
    AND COALESCE(is_referral, false) = true
    AND beneficiary_profile_id = v_profile;

  SELECT COALESCE(SUM(amount), 0)
  INTO v_fitcoin
  FROM public.commissions
  WHERE referred_by_student_id = _student_id
    AND COALESCE(is_referral, false) = true
    AND beneficiary_profile_id = v_profile
    AND status::text IN ('available', 'paid');

  INSERT INTO public.student_wallets (
    student_id, pending_balance, available_balance, total_earned, fitcoin_balance, updated_at
  )
  VALUES (
    _student_id,
    v_pending,
    GREATEST(0, v_available - COALESCE((SELECT total_withdrawn FROM public.student_wallets WHERE student_id = _student_id), 0)),
    v_total_earned,
    v_fitcoin,
    now()
  )
  ON CONFLICT (student_id) DO UPDATE
  SET pending_balance = EXCLUDED.pending_balance,
      available_balance = EXCLUDED.available_balance,
      total_earned = EXCLUDED.total_earned,
      fitcoin_balance = EXCLUDED.fitcoin_balance,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.commissions_credit_fitcoin_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_balance numeric(12,2);
BEGIN
  IF COALESCE(NEW.is_referral, false) = true AND NEW.referred_by_student_id IS NOT NULL THEN
    PERFORM public.recalc_student_wallet_for_referral(NEW.referred_by_student_id);

    SELECT COALESCE(fitcoin_balance, 0)
      INTO v_new_balance
    FROM public.student_wallets
    WHERE student_id = NEW.referred_by_student_id;

    INSERT INTO public.fitcoin_ledger (student_id, amount, reason, commission_id, balance_after)
    VALUES (NEW.referred_by_student_id, NEW.amount, 'referral_earned', NEW.id, COALESCE(v_new_balance, NEW.amount))
    ON CONFLICT (commission_id) WHERE commission_id IS NOT NULL DO UPDATE
    SET amount = EXCLUDED.amount,
        balance_after = EXCLUDED.balance_after;
  END IF;
  RETURN NEW;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS fitcoin_ledger_unique_commission_id
ON public.fitcoin_ledger (commission_id)
WHERE commission_id IS NOT NULL;

CREATE TEMP TABLE _affected_fitcoin_students ON COMMIT DROP AS
SELECT DISTINCT fl.student_id
FROM public.fitcoin_ledger fl
LEFT JOIN public.commissions c ON c.id = fl.commission_id
WHERE fl.reason = 'referral_earned'
  AND (fl.commission_id IS NULL OR c.id IS NULL)
UNION
SELECT DISTINCT referred_by_student_id
FROM public.commissions
WHERE COALESCE(is_referral, false) = true
  AND referred_by_student_id IS NOT NULL;

DELETE FROM public.fitcoin_ledger fl
WHERE fl.reason = 'referral_earned'
  AND (
    fl.commission_id IS NULL
    OR NOT EXISTS (SELECT 1 FROM public.commissions c WHERE c.id = fl.commission_id)
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fitcoin_ledger'::regclass
      AND conname = 'fitcoin_ledger_commission_id_fkey'
  ) THEN
    ALTER TABLE public.fitcoin_ledger DROP CONSTRAINT fitcoin_ledger_commission_id_fkey;
  END IF;
END $$;

ALTER TABLE public.fitcoin_ledger
  ADD CONSTRAINT fitcoin_ledger_commission_id_fkey
  FOREIGN KEY (commission_id) REFERENCES public.commissions(id) ON DELETE CASCADE;

SELECT public.process_paid_transaction('38a5fe06-17cd-458b-99a9-5c263932295f');
SELECT public.process_paid_transaction('6add085b-3585-4d6c-b749-9ea3b0fc9a7b');

WITH ordered AS (
  SELECT
    id,
    SUM(amount) OVER (PARTITION BY student_id ORDER BY created_at, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS computed_balance
  FROM public.fitcoin_ledger
  WHERE reason = 'referral_earned'
    AND commission_id IS NOT NULL
)
UPDATE public.fitcoin_ledger fl
SET balance_after = ordered.computed_balance
FROM ordered
WHERE ordered.id = fl.id;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT student_id FROM _affected_fitcoin_students LOOP
    PERFORM public.recalc_student_wallet_for_referral(r.student_id);
  END LOOP;
END $$;