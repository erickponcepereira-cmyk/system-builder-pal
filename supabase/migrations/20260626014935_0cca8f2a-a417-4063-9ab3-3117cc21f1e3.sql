
-- Coach Store Overrides: per-coach deny list applied recursively to downline viewers

CREATE TABLE IF NOT EXISTS public.coach_store_hidden_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  -- 'product' = item específico; 'section' = uma seção inteira; 'vendor' = todos os produtos de um fornecedor
  target_type text NOT NULL CHECK (target_type IN ('product','section','vendor_partner','vendor_professional','vendor_fitmind')),
  -- Quando target_type='product', identifica de qual tabela vem o id
  product_kind text CHECK (product_kind IS NULL OR product_kind IN ('partner_product','professional_product','digital','store_product','item')),
  -- ID do alvo. NULL apenas para vendor_fitmind (esconde tudo da FitMind)
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS coach_store_hidden_items_unique
  ON public.coach_store_hidden_items (coach_id, target_type, COALESCE(product_kind,''), COALESCE(target_id,'00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS coach_store_hidden_items_coach_idx ON public.coach_store_hidden_items(coach_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coach_store_hidden_items TO authenticated;
GRANT ALL ON public.coach_store_hidden_items TO service_role;

ALTER TABLE public.coach_store_hidden_items ENABLE ROW LEVEL SECURITY;

-- Coach manage own
CREATE POLICY "coach manage own store overrides"
  ON public.coach_store_hidden_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE c.id = coach_store_hidden_items.coach_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE c.id = coach_store_hidden_items.coach_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "admin manage all store overrides"
  ON public.coach_store_hidden_items
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Helper: chain of ancestor coaches for a given auth user (works for student/coach/partner)
CREATE OR REPLACE FUNCTION public.get_viewer_upline_coach_ids(_user_id uuid)
RETURNS TABLE(coach_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id uuid;
  v_start_coach uuid;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN; END IF;

  -- Tentar achar coach upline a partir de student
  SELECT s.coach_id INTO v_start_coach FROM public.students s WHERE s.profile_id = v_profile_id LIMIT 1;

  -- Se não é student, ver se é coach (e usar ele próprio + upline)
  IF v_start_coach IS NULL THEN
    SELECT c.id INTO v_start_coach FROM public.coaches c WHERE c.profile_id = v_profile_id LIMIT 1;
  END IF;

  -- Se não é coach, ver se é partner
  IF v_start_coach IS NULL THEN
    SELECT pa.upline_coach_id INTO v_start_coach FROM public.partners pa WHERE pa.profile_id = v_profile_id LIMIT 1;
  END IF;

  IF v_start_coach IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH RECURSIVE chain AS (
    SELECT c.id, c.upline_coach_id, 1 AS depth
    FROM public.coaches c WHERE c.id = v_start_coach
    UNION ALL
    SELECT c.id, c.upline_coach_id, ch.depth + 1
    FROM public.coaches c
    JOIN chain ch ON c.id = ch.upline_coach_id
    WHERE ch.depth < 20
  )
  SELECT chain.id FROM chain;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_viewer_upline_coach_ids(uuid) TO authenticated;

-- Lista todos os overrides que se aplicam ao viewer atual (qualquer upline)
CREATE OR REPLACE FUNCTION public.store_hidden_for_viewer()
RETURNS TABLE(target_type text, product_kind text, target_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT h.target_type, h.product_kind, h.target_id
  FROM public.coach_store_hidden_items h
  WHERE h.coach_id IN (SELECT coach_id FROM public.get_viewer_upline_coach_ids(auth.uid()));
$$;

GRANT EXECUTE ON FUNCTION public.store_hidden_for_viewer() TO authenticated;

-- Toggle de hide/show pelo coach autenticado
CREATE OR REPLACE FUNCTION public.coach_store_set_hidden(
  _target_type text,
  _product_kind text,
  _target_id uuid,
  _hidden boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_coach_id uuid;
BEGIN
  SELECT c.id INTO v_coach_id
  FROM public.coaches c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF v_coach_id IS NULL THEN
    RAISE EXCEPTION 'Apenas coaches podem alterar visibilidade da loja';
  END IF;

  IF _hidden THEN
    INSERT INTO public.coach_store_hidden_items (coach_id, target_type, product_kind, target_id)
    VALUES (v_coach_id, _target_type, _product_kind, _target_id)
    ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM public.coach_store_hidden_items
    WHERE coach_id = v_coach_id
      AND target_type = _target_type
      AND COALESCE(product_kind,'') = COALESCE(_product_kind,'')
      AND COALESCE(target_id,'00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(_target_id,'00000000-0000-0000-0000-000000000000'::uuid);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.coach_store_set_hidden(text, text, uuid, boolean) TO authenticated;

-- Lista os overrides do coach autenticado (para destacar na UI dele)
CREATE OR REPLACE FUNCTION public.coach_store_list_my_hidden()
RETURNS TABLE(target_type text, product_kind text, target_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.target_type, h.product_kind, h.target_id
  FROM public.coach_store_hidden_items h
  JOIN public.coaches c ON c.id = h.coach_id
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.coach_store_list_my_hidden() TO authenticated;
