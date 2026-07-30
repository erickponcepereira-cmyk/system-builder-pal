CREATE OR REPLACE FUNCTION public.validate_professional_product_duration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slot int;
BEGIN
  IF COALESCE(NEW.is_schedulable, false) IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT MIN(COALESCE(slot_minutes, 30)) INTO v_slot
  FROM public.professional_availability
  WHERE professional_coach_id = NEW.coach_id
    AND COALESCE(is_active, true) = true;

  IF v_slot IS NULL OR v_slot <= 0 THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.default_duration_minutes, 0) <= 0
     OR (NEW.default_duration_minutes % v_slot) <> 0 THEN
    RAISE EXCEPTION 'A duração do produto (% min) precisa ser múltipla dos blocos da agenda (% min).',
      COALESCE(NEW.default_duration_minutes, 0), v_slot;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_professional_product_duration ON public.professional_products;
CREATE TRIGGER trg_validate_professional_product_duration
BEFORE INSERT OR UPDATE OF is_schedulable, default_duration_minutes ON public.professional_products
FOR EACH ROW EXECUTE FUNCTION public.validate_professional_product_duration();