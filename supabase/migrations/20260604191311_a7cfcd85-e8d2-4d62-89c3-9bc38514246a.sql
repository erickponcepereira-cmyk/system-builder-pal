CREATE OR REPLACE FUNCTION public.sync_profile_upline_from_student_coach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.coach_id IS NOT NULL THEN
    UPDATE public.coaches
    SET upline_coach_id = NEW.coach_id
    WHERE profile_id = NEW.profile_id
      AND id <> NEW.coach_id
      AND upline_coach_id IS DISTINCT FROM NEW.coach_id;

    UPDATE public.partners
    SET upline_coach_id = NEW.coach_id
    WHERE profile_id = NEW.profile_id
      AND upline_coach_id IS DISTINCT FROM NEW.coach_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_profile_upline_from_student_coach_trg ON public.students;
CREATE TRIGGER sync_profile_upline_from_student_coach_trg
AFTER INSERT OR UPDATE OF coach_id, profile_id ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_upline_from_student_coach();

CREATE OR REPLACE FUNCTION public.apply_student_coach_to_new_panel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  canonical_coach_id uuid;
BEGIN
  SELECT coach_id INTO canonical_coach_id
  FROM public.students
  WHERE profile_id = NEW.profile_id
  LIMIT 1;

  IF canonical_coach_id IS NOT NULL AND TG_TABLE_NAME = 'coaches' AND NEW.id <> canonical_coach_id THEN
    NEW.upline_coach_id := canonical_coach_id;
  ELSIF canonical_coach_id IS NOT NULL AND TG_TABLE_NAME = 'partners' THEN
    NEW.upline_coach_id := canonical_coach_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS apply_student_coach_to_new_coach_panel_trg ON public.coaches;
CREATE TRIGGER apply_student_coach_to_new_coach_panel_trg
BEFORE INSERT OR UPDATE OF profile_id ON public.coaches
FOR EACH ROW
EXECUTE FUNCTION public.apply_student_coach_to_new_panel();

DROP TRIGGER IF EXISTS apply_student_coach_to_new_partner_panel_trg ON public.partners;
CREATE TRIGGER apply_student_coach_to_new_partner_panel_trg
BEFORE INSERT OR UPDATE OF profile_id ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.apply_student_coach_to_new_panel();

GRANT EXECUTE ON FUNCTION public.sync_profile_upline_from_student_coach() TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_student_coach_to_new_panel() TO service_role;