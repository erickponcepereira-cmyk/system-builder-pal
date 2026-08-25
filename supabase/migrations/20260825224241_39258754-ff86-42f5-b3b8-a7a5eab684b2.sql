CREATE OR REPLACE FUNCTION public.academia_agente_retrato(p_agente_id uuid, p_segredo text)
RETURNS TABLE (ref text, ate date)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  v_carencia integer;
BEGIN
  SELECT id, partner_id INTO a
    FROM public.academia_agentes
   WHERE id = p_agente_id
     AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes
     SET ultimo_contato_em = now(), ultima_sync_em = now()
   WHERE id = a.id;

  SELECT COALESCE(c.dias_carencia, 3) INTO v_carencia
    FROM public.partner_acesso_config c
   WHERE c.partner_id = a.partner_id;
  v_carencia := COALESCE(v_carencia, 3);

  RETURN QUERY
  SELECT cr.referencia,
         (max(m.valido_ate) + v_carencia)::date
    FROM public.academia_credenciais cr
    JOIN public.academia_mensalidades m
      ON m.partner_id = cr.partner_id
     AND m.status = 'ativa'
     AND (
       m.credencial_id = cr.id
       OR (
         m.credencial_id IS NULL
         AND cr.student_id IS NOT NULL
         AND m.student_id = cr.student_id
       )
     )
   WHERE cr.partner_id = a.partner_id
     AND cr.ativo
   GROUP BY cr.referencia;
END;
$$;

CREATE OR REPLACE FUNCTION public.academia_face_enfileirar_credencial(
  p_partner_id uuid,
  p_credencial_id uuid,
  p_foto_base64 text
)
RETURNS TABLE (envio_id uuid, referencia text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credencial RECORD;
  v_id uuid;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(length(p_foto_base64), 0) < 1000 THEN
    RAISE EXCEPTION 'Foto ausente ou pequena demais.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT c.id, c.student_id, c.referencia, c.nome_no_equipamento
    INTO v_credencial
    FROM public.academia_credenciais c
   WHERE c.id = p_credencial_id
     AND c.partner_id = p_partner_id
     AND c.ativo;

  IF v_credencial.id IS NULL THEN
    RAISE EXCEPTION 'Credencial ativa nao encontrada nesta academia.' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.academia_faces_envio e
     SET status = 'erro',
         erro = 'Substituida por uma foto mais recente',
         foto_base64 = NULL
   WHERE e.partner_id = p_partner_id
     AND e.referencia = v_credencial.referencia
     AND e.status = 'pendente';

  INSERT INTO public.academia_faces_envio
    (partner_id, student_id, referencia, nome, foto_base64, criado_por)
  VALUES
    (p_partner_id, v_credencial.student_id, v_credencial.referencia,
     COALESCE(NULLIF(trim(v_credencial.nome_no_equipamento), ''), 'Pessoa da academia'),
     p_foto_base64,
     (SELECT pr.id FROM public.profiles pr WHERE pr.user_id = auth.uid()))
  RETURNING id INTO v_id;

  envio_id := v_id;
  referencia := v_credencial.referencia;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_face_enfileirar_credencial(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_face_enfileirar_credencial(uuid, uuid, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.academia_agente_retrato(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_retrato(uuid, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';