CREATE OR REPLACE FUNCTION public.guard_assessment_photos_size()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_len integer;
BEGIN
  IF NEW.photos IS NULL THEN
    RETURN NEW;
  END IF;

  v_len := length(NEW.photos::text);

  -- Permite manter registros antigos (base64) intactos em updates que não mexem nas fotos
  IF TG_OP = 'UPDATE' AND NEW.photos::text IS NOT DISTINCT FROM OLD.photos::text THEN
    RETURN NEW;
  END IF;

  IF v_len > 200000 THEN
    RAISE EXCEPTION 'Fotos da avaliação muito pesadas. Anexe as fotos novamente para que sejam enviadas ao armazenamento.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_assessment_photos_size ON public.coach_body_assessments;
CREATE TRIGGER trg_guard_assessment_photos_size
BEFORE INSERT OR UPDATE ON public.coach_body_assessments
FOR EACH ROW EXECUTE FUNCTION public.guard_assessment_photos_size();