ALTER TABLE public.partners ADD COLUMN IF NOT EXISTS card_valid_until TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.extend_user_membership_cards(_user_id uuid, _days int DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_now timestamptz := now();
  v_cur timestamptz;
  v_base timestamptz;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = _user_id;
  IF v_profile_id IS NULL THEN RETURN; END IF;

  SELECT card_valid_until INTO v_cur FROM public.coaches WHERE profile_id = v_profile_id;
  IF FOUND THEN
    v_base := GREATEST(COALESCE(v_cur, v_now), v_now);
    UPDATE public.coaches
      SET card_valid_until = v_base + (_days || ' days')::interval,
          updated_at = now()
      WHERE profile_id = v_profile_id;
  END IF;

  SELECT card_valid_until INTO v_cur FROM public.partners WHERE profile_id = v_profile_id;
  IF FOUND THEN
    v_base := GREATEST(COALESCE(v_cur, v_now), v_now);
    UPDATE public.partners
      SET card_valid_until = v_base + (_days || ' days')::interval,
          updated_at = now()
      WHERE profile_id = v_profile_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_subscription_paid_extend_cards()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status IN ('paid','exempted') AND COALESCE(OLD.status::text,'') <> NEW.status::text) THEN
    PERFORM public.extend_user_membership_cards(NEW.user_id, 30);
  ELSIF (TG_OP = 'INSERT' AND NEW.status IN ('paid','exempted')) THEN
    PERFORM public.extend_user_membership_cards(NEW.user_id, 30);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscription_invoice_paid_extend_cards ON public.subscription_invoices;
CREATE TRIGGER subscription_invoice_paid_extend_cards
AFTER INSERT OR UPDATE OF status ON public.subscription_invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_subscription_paid_extend_cards();