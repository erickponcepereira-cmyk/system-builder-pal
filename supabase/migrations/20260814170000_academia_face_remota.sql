-- Cadastrar rosto pelo app, sem ir ate a academia.
--
-- A recepcao (ou o proprio admin) tira a foto no app; o agente pega na proxima
-- sincronizacao e grava no leitor. Sem isso, cada aluno novo exige alguem
-- fisicamente na academia.
--
-- LGPD: a foto e biometria. Ela fica na fila SO ate o agente confirmar que
-- gravou no equipamento, e nesse momento e APAGADA daqui. O destino final da
-- biometria e o leitor, nunca este banco.

CREATE TABLE IF NOT EXISTS public.academia_faces_envio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  -- id que a pessoa tera dentro do leitor
  referencia text NOT NULL,
  nome text NOT NULL,
  -- JPEG em base64. Anulada assim que o agente confirma.
  foto_base64 text,
  status text NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente', 'enviado', 'erro')),
  erro text,
  criado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  enviado_em timestamptz
);

CREATE INDEX IF NOT EXISTS academia_faces_envio_fila_idx
  ON public.academia_faces_envio (partner_id, status)
  WHERE status = 'pendente';

ALTER TABLE public.academia_faces_envio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_faces_envio_acesso ON public.academia_faces_envio;
CREATE POLICY academia_faces_envio_acesso ON public.academia_faces_envio
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- Enfileirar pelo app --------------------------------------------------------
-- Escolhe sozinho um id livre no leitor: o maior ja conhecido mais um. Assim a
-- recepcao nao precisa saber que numero usar.

CREATE OR REPLACE FUNCTION public.academia_face_enfileirar(
  p_partner_id uuid,
  p_student_id uuid,
  p_nome text,
  p_foto_base64 text
)
RETURNS TABLE (envio_id uuid, referencia text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref text;
  v_id uuid;
  v_maior bigint;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(length(p_foto_base64), 0) < 1000 THEN
    RAISE EXCEPTION 'Foto ausente ou pequena demais.' USING ERRCODE = 'check_violation';
  END IF;

  -- Reaproveita a credencial que o aluno ja tiver nesta academia; senao, cria um
  -- id novo acima do maior conhecido, considerando tambem a fila.
  SELECT c.referencia INTO v_ref
    FROM public.academia_credenciais c
   WHERE c.partner_id = p_partner_id AND c.tipo = 'facial'
     AND c.student_id = p_student_id AND c.ativo
   LIMIT 1;

  IF v_ref IS NULL THEN
    SELECT GREATEST(
             COALESCE(max(NULLIF(regexp_replace(c.referencia, '\D', '', 'g'), ''))::bigint, 0),
             COALESCE((SELECT max(NULLIF(regexp_replace(e.referencia, '\D', '', 'g'), ''))::bigint
                         FROM public.academia_faces_envio e
                        WHERE e.partner_id = p_partner_id), 0)
           )
      INTO v_maior
      FROM public.academia_credenciais c
     WHERE c.partner_id = p_partner_id;

    v_ref := (COALESCE(v_maior, 0) + 1)::text;
  END IF;

  INSERT INTO public.academia_faces_envio
    (partner_id, student_id, referencia, nome, foto_base64, criado_por)
  VALUES
    (p_partner_id, p_student_id, v_ref, p_nome, p_foto_base64,
     (SELECT pr.id FROM public.profiles pr WHERE pr.user_id = auth.uid()))
  RETURNING id INTO v_id;

  envio_id := v_id; referencia := v_ref;
  RETURN NEXT;
END;
$$;

-- O agente busca a fila ------------------------------------------------------

CREATE OR REPLACE FUNCTION public.academia_agente_faces_a_enviar(
  p_agente_id uuid,
  p_segredo text
)
RETURNS TABLE (envio_id uuid, referencia text, nome text, foto_base64 text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agente uuid;
  v_partner uuid;
BEGIN
  SELECT a.id, a.partner_id INTO v_agente, v_partner
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF v_agente IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes a SET ultimo_contato_em = now() WHERE a.id = v_agente;

  RETURN QUERY
  SELECT e.id, e.referencia, e.nome, e.foto_base64
    FROM public.academia_faces_envio e
   WHERE e.partner_id = v_partner
     AND e.status = 'pendente'
     AND e.foto_base64 IS NOT NULL
   ORDER BY e.criado_em
   LIMIT 5;
END;
$$;

-- O agente confirma ----------------------------------------------------------
-- Em caso de sucesso a foto e APAGADA daqui e a credencial nasce ja vinculada.

CREATE OR REPLACE FUNCTION public.academia_agente_face_enviada_confirmar(
  p_agente_id uuid,
  p_segredo text,
  p_envio_id uuid,
  p_ok boolean,
  p_erro text
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agente uuid;
  v_partner uuid;
  e RECORD;
BEGIN
  SELECT a.id, a.partner_id INTO v_agente, v_partner
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF v_agente IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO e FROM public.academia_faces_envio
   WHERE id = p_envio_id AND partner_id = v_partner;
  IF e.id IS NULL THEN RETURN false; END IF;

  IF NOT p_ok THEN
    UPDATE public.academia_faces_envio
       SET status = 'erro', erro = left(COALESCE(p_erro, 'falha desconhecida'), 400)
     WHERE id = p_envio_id;
    RETURN false;
  END IF;

  -- A biometria agora vive no leitor. Nao ha motivo para ela continuar aqui.
  UPDATE public.academia_faces_envio
     SET status = 'enviado', enviado_em = now(), foto_base64 = NULL, erro = NULL
   WHERE id = p_envio_id;

  INSERT INTO public.academia_credenciais
    (partner_id, student_id, tipo, referencia, nome_no_equipamento, ativo)
  VALUES
    (v_partner, e.student_id, 'facial', e.referencia, e.nome, true)
  ON CONFLICT ON CONSTRAINT academia_credencial_unica DO UPDATE
    SET student_id = COALESCE(public.academia_credenciais.student_id, EXCLUDED.student_id),
        nome_no_equipamento = COALESCE(EXCLUDED.nome_no_equipamento,
                                       public.academia_credenciais.nome_no_equipamento),
        ativo = true;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_face_enfileirar(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_face_enfileirar(uuid, uuid, text, text) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.academia_agente_faces_a_enviar(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_faces_a_enviar(uuid, text) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.academia_agente_face_enviada_confirmar(uuid, text, uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_face_enviada_confirmar(uuid, text, uuid, boolean, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
