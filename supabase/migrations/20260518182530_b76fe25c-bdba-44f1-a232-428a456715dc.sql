
-- 1) Partners: referral fields
ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS referral_code varchar(20) UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_link text;

-- 2) Students: collaborator link to partner
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_students_partner_id ON public.students(partner_id);

-- 3) Auto-generate partner referral code
CREATE OR REPLACE FUNCTION public.generate_partner_referral_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _code text;
  _tries int := 0;
BEGIN
  IF NEW.referral_code IS NOT NULL AND NEW.referral_code <> '' THEN
    RETURN NEW;
  END IF;
  LOOP
    _code := 'EMP' || upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.partners WHERE referral_code = _code);
    _tries := _tries + 1;
    IF _tries > 8 THEN
      _code := 'EMP' || upper(substring(md5(random()::text || NEW.id::text), 1, 8));
      EXIT;
    END IF;
  END LOOP;
  NEW.referral_code := _code;
  NEW.referral_link := '/r/' || _code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partners_referral_code ON public.partners;
CREATE TRIGGER trg_partners_referral_code
BEFORE INSERT ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.generate_partner_referral_code();

-- Backfill existing partners
UPDATE public.partners
SET referral_code = 'EMP' || upper(substring(md5(random()::text || id::text), 1, 6))
WHERE referral_code IS NULL;

UPDATE public.partners
SET referral_link = '/r/' || referral_code
WHERE referral_link IS NULL AND referral_code IS NOT NULL;

-- 4) Update validate_referral_code to support partners
DROP FUNCTION IF EXISTS public.validate_referral_code(text);

CREATE OR REPLACE FUNCTION public.validate_referral_code(_code text)
RETURNS TABLE(
  valid boolean,
  kind text,
  sponsor_name text,
  coach_id uuid,
  referred_by_student_id uuid,
  partner_id uuid
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _norm text := upper(trim(_code));
  _coach RECORD;
  _student RECORD;
  _partner RECORD;
BEGIN
  IF _norm IS NULL OR _norm = '' THEN
    RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT c.id AS coach_id, p.name::text AS coach_name
  INTO _coach
  FROM public.coaches c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE upper(c.referral_code::text) = _norm
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT true, 'coach'::text, _coach.coach_name::text, _coach.coach_id, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT s.id AS student_id, s.coach_id AS coach_id, p.name::text AS student_name
  INTO _student
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE upper(s.referral_code::text) = _norm
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT true, 'student'::text, _student.student_name::text, _student.coach_id, _student.student_id, NULL::uuid;
    RETURN;
  END IF;

  SELECT pa.id AS partner_id, pa.fantasy_name::text AS pname, pa.upline_coach_id
  INTO _partner
  FROM public.partners pa
  WHERE upper(pa.referral_code::text) = _norm
  LIMIT 1;

  IF FOUND AND _partner.upline_coach_id IS NOT NULL THEN
    RETURN QUERY SELECT true, 'partner'::text, _partner.pname, _partner.upline_coach_id, NULL::uuid, _partner.partner_id;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::uuid;
END;
$$;
