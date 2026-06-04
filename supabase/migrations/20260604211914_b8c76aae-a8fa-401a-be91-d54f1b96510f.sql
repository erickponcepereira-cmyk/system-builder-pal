CREATE OR REPLACE FUNCTION public.grant_challenge_token_on_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_access boolean;
  v_profile_id uuid;
  v_is_coach boolean;
  v_is_partner boolean;
BEGIN
  IF NEW.status::text = 'paid' AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'paid') THEN
    SELECT COALESCE(has_challenge_access, false) INTO has_access
    FROM public.products WHERE id = NEW.product_id;
    IF has_access THEN
      -- Bloqueia geração de moeda se o aluno também é coach/profissional/parceiro
      SELECT profile_id INTO v_profile_id FROM public.students WHERE id = NEW.student_id;
      IF v_profile_id IS NOT NULL THEN
        SELECT EXISTS (SELECT 1 FROM public.coaches WHERE profile_id = v_profile_id) INTO v_is_coach;
        SELECT EXISTS (SELECT 1 FROM public.partners WHERE profile_id = v_profile_id) INTO v_is_partner;
        IF v_is_coach OR v_is_partner THEN
          RETURN NEW;
        END IF;
      END IF;
      INSERT INTO public.student_challenge_tokens
        (student_id, source_transaction_id, source_product_id, granted_by)
      VALUES (NEW.student_id, NEW.id, NEW.product_id, 'purchase')
      ON CONFLICT (source_transaction_id) WHERE source_transaction_id IS NOT NULL DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;