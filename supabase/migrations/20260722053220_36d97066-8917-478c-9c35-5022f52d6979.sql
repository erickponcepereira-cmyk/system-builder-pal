
-- 1) Coluna de vínculo com fatura + idempotência
ALTER TABLE public.student_challenge_tokens
  ADD COLUMN IF NOT EXISTS source_subscription_invoice_id uuid
    REFERENCES public.subscription_invoices(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_student_token_per_invoice
  ON public.student_challenge_tokens (student_id, source_subscription_invoice_id)
  WHERE source_subscription_invoice_id IS NOT NULL;

-- 2) Função que aplica benefícios aos colaboradores de um pagador
CREATE OR REPLACE FUNCTION public.grant_collab_monthly_benefits(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_profile_id uuid;
  v_partner_id uuid;
  v_prof_coach_id uuid;
  v_ref_month date;
  r RECORD;
  v_inserted boolean;
BEGIN
  SELECT user_id, reference_month
    INTO v_user_id, v_ref_month
    FROM public.subscription_invoices
   WHERE id = _invoice_id;
  IF v_user_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_user_id;
  IF v_profile_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_partner_id    FROM public.partners WHERE profile_id = v_profile_id LIMIT 1;
  SELECT id INTO v_prof_coach_id FROM public.coaches
    WHERE profile_id = v_profile_id AND is_professional = true LIMIT 1;

  IF v_partner_id IS NULL AND v_prof_coach_id IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT DISTINCT s.id AS student_id
      FROM public.students s
     WHERE (v_partner_id    IS NOT NULL AND s.partner_id           = v_partner_id)
        OR (v_prof_coach_id IS NOT NULL AND s.professional_coach_id = v_prof_coach_id)
  LOOP
    v_inserted := false;
    BEGIN
      INSERT INTO public.student_challenge_tokens
        (student_id, source_subscription_invoice_id, granted_by, notes)
      VALUES
        (r.student_id, _invoice_id, 'purchase',
         'Colaborador — mensalidade ' || COALESCE(to_char(v_ref_month, 'YYYY-MM'), ''));
      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      v_inserted := false;
    END;

    IF v_inserted THEN
      UPDATE public.students
         SET card_valid_until = GREATEST(COALESCE(card_valid_until, now()), now())
                              + INTERVAL '30 days',
             updated_at = now()
       WHERE id = r.student_id;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_collab_monthly_benefits(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_collab_monthly_benefits(uuid) TO service_role;

-- 3) Trigger em subscription_invoices ao virar paid
CREATE OR REPLACE FUNCTION public.trg_grant_collab_on_invoice_paid_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM public.grant_collab_monthly_benefits(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_grant_collab_on_invoice_paid ON public.subscription_invoices;
CREATE TRIGGER trg_grant_collab_on_invoice_paid
AFTER INSERT OR UPDATE OF status ON public.subscription_invoices
FOR EACH ROW EXECUTE FUNCTION public.trg_grant_collab_on_invoice_paid_fn();

-- 4) Backfill: aplica para faturas pagas nos últimos 60 dias
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.subscription_invoices
     WHERE status = 'paid'
       AND paid_at >= now() - INTERVAL '60 days'
  LOOP
    PERFORM public.grant_collab_monthly_benefits(r.id);
  END LOOP;
END $$;
