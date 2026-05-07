
-- Freebies (itens gratuitos)
CREATE TABLE public.freebies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  image_url text,
  kind text NOT NULL DEFAULT 'digital' CHECK (kind IN ('physical','digital')),
  stock integer,
  per_student_limit integer NOT NULL DEFAULT 1,
  valid_from timestamptz,
  valid_until timestamptz,
  condition_note text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.freebies ENABLE ROW LEVEL SECURITY;

CREATE POLICY freebies_read_all ON public.freebies FOR SELECT USING (is_active = true OR is_admin(auth.uid()));
CREATE POLICY freebies_admin_all ON public.freebies FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_freebies_updated_at BEFORE UPDATE ON public.freebies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resgates
CREATE TABLE public.freebie_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  freebie_id uuid NOT NULL REFERENCES public.freebies(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','cancelled')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

CREATE INDEX idx_freebie_redemptions_student ON public.freebie_redemptions(student_id);
CREATE INDEX idx_freebie_redemptions_freebie ON public.freebie_redemptions(freebie_id);

ALTER TABLE public.freebie_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY freebie_red_admin_all ON public.freebie_redemptions FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY freebie_red_student_select ON public.freebie_redemptions FOR SELECT USING (
  student_id IN (SELECT s.id FROM students s JOIN profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

CREATE POLICY freebie_red_student_insert ON public.freebie_redemptions FOR INSERT WITH CHECK (
  student_id IN (SELECT s.id FROM students s JOIN profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

CREATE POLICY freebie_red_coach_select ON public.freebie_redemptions FOR SELECT USING (
  student_id IN (
    SELECT s.id FROM students s
    WHERE s.coach_id IN (SELECT c.id FROM coaches c JOIN profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid())
  )
);

-- Função de resgate (valida limites, validade e estoque, debita)
CREATE OR REPLACE FUNCTION public.redeem_freebie(_freebie_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_count integer;
  v_freebie record;
  v_redemption_id uuid;
BEGIN
  SELECT s.id INTO v_student_id
  FROM students s JOIN profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;

  SELECT * INTO v_freebie FROM freebies WHERE id = _freebie_id AND is_active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brinde indisponível'; END IF;

  IF v_freebie.valid_from IS NOT NULL AND now() < v_freebie.valid_from THEN
    RAISE EXCEPTION 'Brinde ainda não disponível';
  END IF;
  IF v_freebie.valid_until IS NOT NULL AND now() > v_freebie.valid_until THEN
    RAISE EXCEPTION 'Brinde expirado';
  END IF;
  IF v_freebie.stock IS NOT NULL AND v_freebie.stock <= 0 THEN
    RAISE EXCEPTION 'Brinde esgotado';
  END IF;

  SELECT count(*) INTO v_count FROM freebie_redemptions
  WHERE freebie_id = _freebie_id AND student_id = v_student_id AND status <> 'cancelled';

  IF v_count >= v_freebie.per_student_limit THEN
    RAISE EXCEPTION 'Limite de resgate atingido';
  END IF;

  INSERT INTO freebie_redemptions (freebie_id, student_id, status)
  VALUES (_freebie_id, v_student_id, CASE WHEN v_freebie.kind = 'digital' THEN 'delivered' ELSE 'pending' END)
  RETURNING id INTO v_redemption_id;

  IF v_freebie.stock IS NOT NULL THEN
    UPDATE freebies SET stock = stock - 1 WHERE id = _freebie_id;
  END IF;

  RETURN v_redemption_id;
END;
$$;
