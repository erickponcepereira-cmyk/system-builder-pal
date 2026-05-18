
CREATE OR REPLACE FUNCTION public.mirror_partner_as_coach()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _coach_id uuid; _code text; _tries int := 0;
BEGIN
  SELECT id INTO _coach_id FROM public.coaches WHERE profile_id = NEW.profile_id LIMIT 1;
  IF _coach_id IS NULL THEN
    LOOP
      _code := 'EMP' || upper(substring(md5(NEW.id::text || clock_timestamp()::text || _tries::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.coaches WHERE referral_code = _code);
      _tries := _tries + 1;
      EXIT WHEN _tries > 8;
    END LOOP;
    INSERT INTO public.coaches (profile_id, referral_code, upline_coach_id, approved_at, is_professional, serves_whole_network)
    VALUES (NEW.profile_id, _code, NEW.upline_coach_id, NEW.approved_at, false, false);
  ELSE
    UPDATE public.coaches
    SET upline_coach_id = COALESCE(upline_coach_id, NEW.upline_coach_id),
        approved_at = COALESCE(approved_at, NEW.approved_at)
    WHERE id = _coach_id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_mirror_partner_as_coach ON public.partners;
CREATE TRIGGER trg_mirror_partner_as_coach
AFTER INSERT OR UPDATE OF profile_id, upline_coach_id, approved_at ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.mirror_partner_as_coach();

CREATE OR REPLACE FUNCTION public.ensure_self_student_for_coach()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.upline_coach_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.students (profile_id, coach_id)
  VALUES (NEW.profile_id, NEW.upline_coach_id)
  ON CONFLICT (profile_id) DO UPDATE
  SET coach_id = COALESCE(public.students.coach_id, EXCLUDED.coach_id);
  RETURN NEW;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='students_profile_id_key') THEN
    ALTER TABLE public.students ADD CONSTRAINT students_profile_id_key UNIQUE (profile_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_ensure_self_student_for_coach ON public.coaches;
CREATE TRIGGER trg_ensure_self_student_for_coach
AFTER INSERT ON public.coaches
FOR EACH ROW EXECUTE FUNCTION public.ensure_self_student_for_coach();

CREATE OR REPLACE FUNCTION public.assign_partner_coach_to_collaborator()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _coach_id uuid; _partner_profile uuid;
BEGIN
  IF NEW.partner_id IS NOT NULL AND NEW.coach_id IS NULL THEN
    SELECT profile_id INTO _partner_profile FROM public.partners WHERE id = NEW.partner_id;
    IF _partner_profile IS NOT NULL THEN
      SELECT id INTO _coach_id FROM public.coaches WHERE profile_id = _partner_profile LIMIT 1;
      IF _coach_id IS NOT NULL THEN
        NEW.coach_id := _coach_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_partner_coach_to_collaborator ON public.students;
CREATE TRIGGER trg_assign_partner_coach_to_collaborator
BEFORE INSERT OR UPDATE OF partner_id ON public.students
FOR EACH ROW EXECUTE FUNCTION public.assign_partner_coach_to_collaborator();

-- Backfill: mirror existing partners
DO $$
DECLARE r RECORD; _code text; _tries int;
BEGIN
  FOR r IN SELECT * FROM public.partners LOOP
    IF NOT EXISTS (SELECT 1 FROM public.coaches WHERE profile_id = r.profile_id) THEN
      _tries := 0;
      LOOP
        _code := 'EMP' || upper(substring(md5(r.id::text || _tries::text), 1, 6));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.coaches WHERE referral_code = _code);
        _tries := _tries + 1;
        EXIT WHEN _tries > 8;
      END LOOP;
      INSERT INTO public.coaches (profile_id, referral_code, upline_coach_id, approved_at, is_professional, serves_whole_network)
      VALUES (r.profile_id, _code, r.upline_coach_id, r.approved_at, false, false);
    END IF;
  END LOOP;
END $$;

-- Backfill self-student only when upline exists
INSERT INTO public.students (profile_id, coach_id)
SELECT c.profile_id, c.upline_coach_id
FROM public.coaches c
WHERE c.upline_coach_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.students s WHERE s.profile_id = c.profile_id)
ON CONFLICT (profile_id) DO NOTHING;

-- Backfill collaborators
UPDATE public.students s
SET coach_id = c.id
FROM public.partners p
JOIN public.coaches c ON c.profile_id = p.profile_id
WHERE s.partner_id = p.id AND s.coach_id IS NULL;
