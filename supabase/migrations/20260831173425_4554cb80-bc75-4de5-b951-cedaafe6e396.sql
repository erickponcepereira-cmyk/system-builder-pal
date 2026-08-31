CREATE TABLE public.referral_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  referred_by_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  sponsor_name text,
  product_id uuid,
  landing_path text,
  user_agent text,
  claimed_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_referral_touches_claimed ON public.referral_touches(claimed_profile_id);
CREATE INDEX idx_referral_touches_created ON public.referral_touches(created_at DESC);

GRANT SELECT ON public.referral_touches TO authenticated;
GRANT ALL ON public.referral_touches TO service_role;

ALTER TABLE public.referral_touches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins veem todos os toques"
ON public.referral_touches FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_referral_touches_updated_at
BEFORE UPDATE ON public.referral_touches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.registrar_toque_indicacao(
  _code text,
  _product_id uuid DEFAULT NULL,
  _landing_path text DEFAULT NULL,
  _user_agent text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_id uuid;
BEGIN
  IF _code IS NULL OR btrim(_code) = '' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row FROM public.validate_referral_code(_code) LIMIT 1;
  IF v_row IS NULL OR COALESCE(v_row.valid, false) = false THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.referral_touches (
    code, coach_id, partner_id, referred_by_student_id, sponsor_name,
    product_id, landing_path, user_agent
  ) VALUES (
    upper(btrim(_code)), v_row.coach_id, v_row.partner_id, v_row.referred_by_student_id,
    v_row.sponsor_name, _product_id, left(COALESCE(_landing_path, ''), 400),
    left(COALESCE(_user_agent, ''), 400)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_toque_indicacao(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_toque_indicacao(text, uuid, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.toque_indicacao_por_id(_touch_id uuid)
RETURNS TABLE (
  id uuid,
  code text,
  coach_id uuid,
  partner_id uuid,
  referred_by_student_id uuid,
  sponsor_name text,
  product_id uuid,
  landing_path text,
  created_at timestamptz,
  claimed_profile_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.code, t.coach_id, t.partner_id, t.referred_by_student_id,
         t.sponsor_name, t.product_id, t.landing_path, t.created_at, t.claimed_profile_id
  FROM public.referral_touches t
  WHERE t.id = _touch_id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.toque_indicacao_por_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toque_indicacao_por_id(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.vincular_toque_ao_perfil(_touch_id uuid, _profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _touch_id IS NULL OR _profile_id IS NULL THEN
    RETURN false;
  END IF;
  UPDATE public.referral_touches
     SET claimed_profile_id = _profile_id,
         claimed_at = now(),
         updated_at = now()
   WHERE id = _touch_id
     AND claimed_profile_id IS NULL;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.vincular_toque_ao_perfil(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vincular_toque_ao_perfil(uuid, uuid) TO service_role;