
-- Add configurable ticket amount per product
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS challenge_tokens_amount integer NOT NULL DEFAULT 1
  CHECK (challenge_tokens_amount >= 0);

-- Drop unique-per-transaction so multiple tokens may be granted per purchase
DROP INDEX IF EXISTS public.uniq_token_per_transaction;

-- Update trigger to grant N tokens per paid transaction
CREATE OR REPLACE FUNCTION public.grant_challenge_token_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_access boolean;
  v_amount integer;
  v_profile_id uuid;
  v_is_coach boolean;
  v_is_partner boolean;
  v_existing integer;
  v_to_grant integer;
BEGIN
  IF NEW.status::text = 'paid' AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'paid') THEN
    SELECT COALESCE(has_challenge_access, false), COALESCE(challenge_tokens_amount, 1)
      INTO has_access, v_amount
    FROM public.products WHERE id = NEW.product_id;

    IF has_access AND COALESCE(v_amount, 0) > 0 THEN
      SELECT profile_id INTO v_profile_id FROM public.students WHERE id = NEW.student_id;
      IF v_profile_id IS NOT NULL THEN
        SELECT EXISTS (SELECT 1 FROM public.coaches WHERE profile_id = v_profile_id) INTO v_is_coach;
        SELECT EXISTS (SELECT 1 FROM public.partners WHERE profile_id = v_profile_id) INTO v_is_partner;
        IF v_is_coach OR v_is_partner THEN
          RETURN NEW;
        END IF;
      END IF;

      -- Idempotent: only insert the missing tokens for this transaction
      SELECT COUNT(*) INTO v_existing
        FROM public.student_challenge_tokens
        WHERE source_transaction_id = NEW.id;

      v_to_grant := GREATEST(v_amount - COALESCE(v_existing, 0), 0);

      IF v_to_grant > 0 THEN
        INSERT INTO public.student_challenge_tokens
          (student_id, source_transaction_id, source_product_id, granted_by)
        SELECT NEW.student_id, NEW.id, NEW.product_id, 'purchase'
        FROM generate_series(1, v_to_grant);
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
