CREATE OR REPLACE FUNCTION public.admin_hard_delete_user(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_profile_id uuid;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF v_caller IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE user_id = v_caller AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Acesso negado';
    END IF;
    IF v_caller = _user_id THEN
      RAISE EXCEPTION 'Você não pode excluir o próprio cadastro.';
    END IF;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = _user_id;
  IF v_profile_id IS NOT NULL THEN
    PERFORM set_config('fitmind.deleting_profile_id', v_profile_id::text, true);
  END IF;

  PERFORM public.admin_purge_user_dependents(_user_id);

  DELETE FROM public.wallets WHERE profile_id = v_profile_id;
  DELETE FROM public.profiles WHERE user_id = _user_id;
  DELETE FROM auth.identities WHERE user_id = _user_id;
  DELETE FROM auth.sessions WHERE user_id = _user_id;
  DELETE FROM auth.mfa_factors WHERE user_id = _user_id;
  DELETE FROM auth.one_time_tokens WHERE user_id = _user_id;
  DELETE FROM auth.users WHERE id = _user_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_hard_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_hard_delete_user(uuid) TO authenticated, service_role;