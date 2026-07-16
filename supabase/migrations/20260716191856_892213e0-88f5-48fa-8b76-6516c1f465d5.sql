-- Backfill approved_at for approved partners with missing timestamp
UPDATE public.partners
SET approved_at = COALESCE(approved_at, updated_at, now())
WHERE status = 'approved' AND approved_at IS NULL AND blocked_at IS NULL;

-- Trigger to keep approved_at consistent with status='approved'
CREATE OR REPLACE FUNCTION public.partners_ensure_approved_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND NEW.approved_at IS NULL AND NEW.blocked_at IS NULL THEN
    NEW.approved_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partners_ensure_approved_at_trg ON public.partners;
CREATE TRIGGER partners_ensure_approved_at_trg
BEFORE INSERT OR UPDATE ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.partners_ensure_approved_at();