CREATE OR REPLACE FUNCTION public.get_viewer_upline_coach_ids(_user_id uuid)
RETURNS TABLE(coach_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_self_coach uuid;
  v_start_coach uuid;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = _user_id LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN; END IF;

  -- Identificar se o viewer é coach (para excluir ele mesmo da chain)
  SELECT c.id INTO v_self_coach FROM public.coaches c WHERE c.profile_id = v_profile_id LIMIT 1;

  -- Resolver o ponto de partida da cadeia upline:
  -- 1) Se é student, começa pelo coach dele
  SELECT s.coach_id INTO v_start_coach FROM public.students s WHERE s.profile_id = v_profile_id LIMIT 1;
  -- 2) Se é coach (e não tem registro de student), começa pelo upline_coach_id dele
  IF v_start_coach IS NULL AND v_self_coach IS NOT NULL THEN
    SELECT c.upline_coach_id INTO v_start_coach FROM public.coaches c WHERE c.id = v_self_coach;
  END IF;
  -- 3) Se é partner, usa upline_coach_id
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
  SELECT chain.id FROM chain
  WHERE v_self_coach IS NULL OR chain.id <> v_self_coach;
END;
$function$;