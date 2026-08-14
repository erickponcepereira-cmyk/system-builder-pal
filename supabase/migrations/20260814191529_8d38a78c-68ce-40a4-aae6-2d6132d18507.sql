CREATE OR REPLACE FUNCTION public.transfer_evaluation_client_link(
  _client_id uuid,
  _student_id uuid,
  _delete_duplicates boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client record;
  v_dups uuid[];
  v_allowed boolean;
BEGIN
  IF _client_id IS NULL OR _student_id IS NULL THEN
    RAISE EXCEPTION 'Parâmetros inválidos';
  END IF;

  SELECT id, coach_id, name, student_id INTO v_client
  FROM public.coach_evaluation_clients WHERE id = _client_id;
  IF v_client.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro de avaliação não encontrado';
  END IF;

  v_allowed := COALESCE(public.current_user_is_admin(), false)
            OR COALESCE(public.current_user_is_master_coach(), false)
            OR v_client.coach_id = ANY (COALESCE(public.current_user_coach_ids(), ARRAY[]::uuid[]));
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Sem permissão para transferir este vínculo';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO v_dups
  FROM public.coach_evaluation_clients
  WHERE student_id = _student_id AND id <> _client_id;

  IF array_length(v_dups, 1) > 0 THEN
    UPDATE public.coach_body_assessments
      SET client_id = _client_id, student_id = _student_id
      WHERE client_id = ANY (v_dups);

    IF _delete_duplicates THEN
      DELETE FROM public.coach_evaluation_clients WHERE id = ANY (v_dups);
    ELSE
      UPDATE public.coach_evaluation_clients SET student_id = NULL WHERE id = ANY (v_dups);
    END IF;
  END IF;

  UPDATE public.coach_evaluation_clients
    SET student_id = _student_id
    WHERE id = _client_id;

  UPDATE public.coach_body_assessments
    SET student_id = _student_id
    WHERE client_id = _client_id;

  RETURN jsonb_build_object(
    'ok', true,
    'client_id', _client_id,
    'student_id', _student_id,
    'previous_student_id', v_client.student_id,
    'coach_id', v_client.coach_id,
    'merged_client_ids', to_jsonb(v_dups),
    'deleted', _delete_duplicates AND COALESCE(array_length(v_dups, 1), 0) > 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_evaluation_client_link(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_evaluation_client_link(uuid, uuid, boolean) TO authenticated;