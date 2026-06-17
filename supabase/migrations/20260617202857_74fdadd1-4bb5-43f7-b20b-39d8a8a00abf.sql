
-- Auto-cria assinatura mensal para coach, parceiro e profissional ao serem aprovados/criados.

CREATE OR REPLACE FUNCTION public.auto_ensure_subscription_for_profile(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = _profile_id;
  IF v_user_id IS NULL THEN RETURN; END IF;
  PERFORM public.ensure_user_subscription(v_user_id, 5);
END;
$$;

-- Trigger para coaches (qualquer criação já gera assinatura ativa)
CREATE OR REPLACE FUNCTION public.trg_coach_ensure_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.auto_ensure_subscription_for_profile(NEW.profile_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coaches_ensure_subscription ON public.coaches;
CREATE TRIGGER trg_coaches_ensure_subscription
AFTER INSERT ON public.coaches
FOR EACH ROW EXECUTE FUNCTION public.trg_coach_ensure_subscription();

-- Trigger para partners
CREATE OR REPLACE FUNCTION public.trg_partner_ensure_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.auto_ensure_subscription_for_profile(NEW.profile_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_partners_ensure_subscription ON public.partners;
CREATE TRIGGER trg_partners_ensure_subscription
AFTER INSERT ON public.partners
FOR EACH ROW EXECUTE FUNCTION public.trg_partner_ensure_subscription();

-- BACKFILL: cria assinatura para qualquer coach/parceiro/profissional sem assinatura
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT pr.user_id
    FROM public.profiles pr
    WHERE pr.user_id IS NOT NULL
      AND (
        EXISTS (SELECT 1 FROM public.coaches c WHERE c.profile_id = pr.id)
        OR EXISTS (SELECT 1 FROM public.partners p WHERE p.profile_id = pr.id)
      )
      AND NOT EXISTS (SELECT 1 FROM public.user_subscriptions us WHERE us.user_id = pr.user_id)
  LOOP
    PERFORM public.ensure_user_subscription(r.user_id, 5);
  END LOOP;
END $$;

-- Gera a fatura do mês atual para qualquer assinatura ativa que ainda não tenha
SELECT public.generate_monthly_invoices();
