-- Store visibility: creator-aware exception + card days no-op change.
CREATE OR REPLACE FUNCTION public.store_visibility_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_profile_id uuid;
  v_self_coach uuid;
  v_start_coach uuid;
  v_chain jsonb;
  v_hides jsonb;
  v_my jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('chain','[]'::jsonb,'self_coach_id',NULL,'hidden','[]'::jsonb,'my_hidden','[]'::jsonb);
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_user LIMIT 1;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('chain','[]'::jsonb,'self_coach_id',NULL,'hidden','[]'::jsonb,'my_hidden','[]'::jsonb);
  END IF;

  SELECT c.id INTO v_self_coach FROM public.coaches c WHERE c.profile_id = v_profile_id LIMIT 1;

  SELECT s.coach_id INTO v_start_coach FROM public.students s WHERE s.profile_id = v_profile_id LIMIT 1;
  IF v_start_coach IS NULL AND v_self_coach IS NOT NULL THEN
    SELECT c.upline_coach_id INTO v_start_coach FROM public.coaches c WHERE c.id = v_self_coach;
  END IF;
  IF v_start_coach IS NULL THEN
    SELECT pa.upline_coach_id INTO v_start_coach FROM public.partners pa WHERE pa.profile_id = v_profile_id LIMIT 1;
  END IF;

  IF v_start_coach IS NULL THEN
    v_chain := '[]'::jsonb;
  ELSE
    WITH RECURSIVE chain AS (
      SELECT c.id, c.upline_coach_id, 1 AS depth
      FROM public.coaches c WHERE c.id = v_start_coach
      UNION ALL
      SELECT c.id, c.upline_coach_id, ch.depth + 1
      FROM public.coaches c
      JOIN chain ch ON c.id = ch.upline_coach_id
      WHERE ch.depth < 20
    ),
    chain_filtered AS (
      SELECT id, depth FROM chain
      WHERE v_self_coach IS NULL OR id <> v_self_coach
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('coach_id', id, 'depth', depth) ORDER BY depth), '[]'::jsonb)
      INTO v_chain FROM chain_filtered;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'target_type', h.target_type,
    'product_kind', h.product_kind,
    'target_id', h.target_id,
    'hider_coach_id', h.coach_id
  )), '[]'::jsonb)
    INTO v_hides
  FROM public.coach_store_hidden_items h
  WHERE h.coach_id IN (
    SELECT (elem->>'coach_id')::uuid FROM jsonb_array_elements(v_chain) elem
  );

  IF v_self_coach IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'target_type', h.target_type,
      'product_kind', h.product_kind,
      'target_id', h.target_id
    )), '[]'::jsonb)
      INTO v_my
    FROM public.coach_store_hidden_items h
    WHERE h.coach_id = v_self_coach;
  ELSE
    v_my := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'chain', v_chain,
    'self_coach_id', v_self_coach,
    'hidden', v_hides,
    'my_hidden', v_my
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.store_visibility_context() TO authenticated, anon;