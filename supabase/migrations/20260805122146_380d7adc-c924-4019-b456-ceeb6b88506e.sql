CREATE OR REPLACE FUNCTION public.link_partner_collaborator(_student_id uuid, _partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid;
  v_count int;
BEGIN
  SELECT current_profile_id() INTO v_profile;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.partners p WHERE p.id = _partner_id AND p.profile_id = v_profile) THEN
    RAISE EXCEPTION 'Acesso restrito ao dono do parceiro';
  END IF;

  SELECT count(*) INTO v_count FROM public.students s WHERE s.partner_id = _partner_id;
  IF v_count >= 7 THEN
    RAISE EXCEPTION 'Limite de 7 colaboradores atingido';
  END IF;

  UPDATE public.students SET partner_id = _partner_id, updated_at = now()
  WHERE id = _student_id AND (partner_id IS NULL OR partner_id = _partner_id);

  IF NOT FOUND THEN RAISE EXCEPTION 'Aluno indisponível para vínculo'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlink_partner_collaborator(_student_id uuid, _partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile uuid;
BEGIN
  SELECT current_profile_id() INTO v_profile;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.partners p WHERE p.id = _partner_id AND p.profile_id = v_profile) THEN
    RAISE EXCEPTION 'Acesso restrito ao dono do parceiro';
  END IF;

  UPDATE public.students SET partner_id = NULL, updated_at = now()
  WHERE id = _student_id AND partner_id = _partner_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_partner_collaborator(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unlink_partner_collaborator(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_partner_collaborator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_partner_collaborator(uuid, uuid) TO authenticated;