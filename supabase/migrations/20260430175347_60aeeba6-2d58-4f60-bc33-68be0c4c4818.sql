-- 1) Resolve referral code -> who is the sponsor (coach or student)
-- Returns: kind ('coach'|'student'), sponsor name, coach_id (the coach the new student should be tied to),
-- referred_by_student_id (set when a student is the sponsor), and a flag.
CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
RETURNS TABLE (
  valid boolean,
  kind text,
  sponsor_name text,
  coach_id uuid,
  referred_by_student_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := upper(trim(_code));
  _coach RECORD;
  _student RECORD;
BEGIN
  IF _norm IS NULL OR _norm = '' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT c.id AS coach_id, p.name AS coach_name
  INTO _coach
  FROM public.coaches c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE upper(c.referral_code) = _norm
    AND c.approved_at IS NOT NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT true, 'coach'::text, _coach.coach_name, _coach.coach_id, NULL::uuid;
    RETURN;
  END IF;

  SELECT s.id AS student_id, s.coach_id AS coach_id, p.name AS student_name
  INTO _student
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE upper(s.referral_code) = _norm
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT true, 'student'::text, _student.student_name, _student.coach_id, _student.student_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::uuid, NULL::uuid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_referral_code(text) TO anon, authenticated;

-- 2) Award the 50% referral commission to the sponsor on the FIRST challenge purchase
--    of a referred student. Triggered AFTER INSERT on transactions.
CREATE OR REPLACE FUNCTION public.award_referral_commission_on_first_challenge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student RECORD;
  _has_challenge_item boolean := false;
  _is_first_challenge boolean := false;
  _challenge_total numeric := 0;
  _percentage numeric := 50;
  _commission_amount numeric := 0;
  _sponsor_profile_id uuid;
  _sponsor_student_record RECORD;
  _challenge_product_id uuid;
BEGIN
  -- Only run for store_orders (challenges are sold via store_order)
  IF NEW.purchase_type IS DISTINCT FROM 'store_order' THEN
    RETURN NEW;
  END IF;

  -- Get the student and their sponsor info
  SELECT s.id, s.referred_by_student_id, s.coach_id
  INTO _student
  FROM public.students s
  WHERE s.id = NEW.student_id;

  -- Only proceed if there is a student-sponsor (padrinho) recorded
  IF _student.referred_by_student_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Check there is at least one 'challenge' line on this order, sum the challenge items total,
  -- and grab the first challenge product_id we see.
  SELECT
    COALESCE(SUM(soi.total_price), 0),
    bool_or(soi.product_kind = 'challenge'),
    (array_agg(soi.product_id) FILTER (WHERE soi.product_kind = 'challenge'))[1]
  INTO _challenge_total, _has_challenge_item, _challenge_product_id
  FROM public.store_orders so
  JOIN public.store_order_items soi ON soi.order_id = so.id
  WHERE so.student_id = NEW.student_id
    AND soi.product_kind = 'challenge'
    AND so.id = (
      SELECT id FROM public.store_orders
      WHERE student_id = NEW.student_id
      ORDER BY created_at DESC
      LIMIT 1
    );

  IF NOT _has_challenge_item OR _challenge_total <= 0 THEN
    RETURN NEW;
  END IF;

  -- Was this the FIRST challenge purchase ever for this student?
  -- (Look for any previous transaction tied to a store order containing a challenge.)
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.transactions t
    JOIN public.store_orders so2 ON so2.student_id = t.student_id
    JOIN public.store_order_items soi2 ON soi2.order_id = so2.id
    WHERE t.student_id = NEW.student_id
      AND t.id <> NEW.id
      AND t.purchase_type = 'store_order'
      AND soi2.product_kind = 'challenge'
  )
  INTO _is_first_challenge;

  IF NOT _is_first_challenge THEN
    RETURN NEW;
  END IF;

  -- Resolve sponsor (padrinho) profile_id
  SELECT s.profile_id, s.id
  INTO _sponsor_student_record
  FROM public.students s
  WHERE s.id = _student.referred_by_student_id;

  IF _sponsor_student_record.profile_id IS NULL THEN
    RETURN NEW;
  END IF;

  _sponsor_profile_id := _sponsor_student_record.profile_id;

  -- Use product-defined referral percentage if set, otherwise default 50%
  IF _challenge_product_id IS NOT NULL THEN
    SELECT COALESCE(p.referral_commission_percentage, 50)
    INTO _percentage
    FROM public.products p
    WHERE p.id = _challenge_product_id;
  END IF;

  _commission_amount := ROUND(_challenge_total * _percentage / 100.0, 2);

  -- Create the referral commission record
  INSERT INTO public.commissions (
    transaction_id,
    beneficiary_profile_id,
    beneficiary_coach_id,
    level,
    percentage,
    amount,
    status,
    available_at,
    is_referral,
    referred_by_student_id
  )
  VALUES (
    NEW.id,
    _sponsor_profile_id,
    NULL,
    0,
    _percentage,
    _commission_amount,
    'pending',
    now() + interval '7 days',
    true,
    _student.referred_by_student_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_commission_on_first_challenge ON public.transactions;
CREATE TRIGGER trg_referral_commission_on_first_challenge
AFTER INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.award_referral_commission_on_first_challenge();