
-- 1. Corrige dados existentes: qualquer coach com upline = ele mesmo
UPDATE public.coaches SET upline_coach_id = NULL WHERE upline_coach_id = id;

-- 2. CHECK constraint para bloquear auto-referência
ALTER TABLE public.coaches
  DROP CONSTRAINT IF EXISTS coaches_upline_not_self_chk;
ALTER TABLE public.coaches
  ADD CONSTRAINT coaches_upline_not_self_chk
  CHECK (upline_coach_id IS NULL OR upline_coach_id <> id);

-- 3. Trigger anti-ciclo (A->B->A, etc.)
CREATE OR REPLACE FUNCTION public.prevent_coach_upline_cycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  cursor_id uuid;
  hops int := 0;
BEGIN
  IF NEW.upline_coach_id IS NULL THEN
    RETURN NEW;
  END IF;

  cursor_id := NEW.upline_coach_id;
  WHILE cursor_id IS NOT NULL AND hops < 50 LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'Ciclo detectado na cadeia de upline do coach %', NEW.id;
    END IF;
    SELECT upline_coach_id INTO cursor_id FROM public.coaches WHERE id = cursor_id;
    hops := hops + 1;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_coach_upline_cycle ON public.coaches;
CREATE TRIGGER trg_prevent_coach_upline_cycle
  BEFORE INSERT OR UPDATE OF upline_coach_id ON public.coaches
  FOR EACH ROW EXECUTE FUNCTION public.prevent_coach_upline_cycle();
