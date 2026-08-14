-- Rosto pelo agente: o que o programa do PC precisa para cadastrar e apagar.
--
-- Apagar rosto no equipamento so e possivel de dentro da rede da academia. Ate
-- agora academia_faces_a_remover era uma lista para tarefa humana; com estas
-- duas funcoes o agente faz sozinho, e o prazo deixa de depender de alguem
-- lembrar.
--
-- Sao autenticadas pelo segredo do agente, como as outras, porque o programa
-- nao tem login de usuario.

CREATE OR REPLACE FUNCTION public.academia_agente_faces_pendentes(
  p_agente_id uuid,
  p_segredo text
)
RETURNS TABLE (inscricao_id uuid, referencia text, politica text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT id, partner_id INTO a
    FROM public.academia_agentes
   WHERE id = p_agente_id
     AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes SET ultimo_contato_em = now() WHERE id = a.id;

  RETURN QUERY
  SELECT i.id, i.credencial, e.face_politica
    FROM public.academia_evento_inscricoes i
    JOIN public.academia_eventos e ON e.id = i.evento_id
   WHERE i.partner_id = a.partner_id
     AND i.face_enviada_em IS NOT NULL
     AND i.face_removida_em IS NULL
     AND (
       (e.face_politica = 'uma_leitura' AND i.usado_em IS NOT NULL)
       OR (e.face_politica = 'apagar_24h' AND i.face_remover_ate <= now())
     );
END;
$$;

-- O agente confirma o que apagou de fato. Sem essa confirmacao o registro
-- continua pendente — melhor insistir do que marcar como apagado algo que
-- ainda esta no equipamento.
CREATE OR REPLACE FUNCTION public.academia_agente_face_removida(
  p_agente_id uuid,
  p_segredo text,
  p_inscricao_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT id, partner_id INTO a
    FROM public.academia_agentes
   WHERE id = p_agente_id
     AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_evento_inscricoes
     SET face_removida_em = now()
   WHERE id = p_inscricao_id
     AND partner_id = a.partner_id
     AND face_removida_em IS NULL;

  RETURN FOUND;
END;
$$;

-- O agente avisa que enviou um rosto, para o prazo comecar a contar. O trigger
-- academia_face_prazo preenche face_remover_ate sozinho.
CREATE OR REPLACE FUNCTION public.academia_agente_face_enviada(
  p_agente_id uuid,
  p_segredo text,
  p_inscricao_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
BEGIN
  SELECT id, partner_id INTO a
    FROM public.academia_agentes
   WHERE id = p_agente_id
     AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_evento_inscricoes
     SET face_enviada_em = COALESCE(face_enviada_em, now())
   WHERE id = p_inscricao_id
     AND partner_id = a.partner_id;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.academia_agente_faces_pendentes(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_agente_face_removida(uuid, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_agente_face_enviada(uuid, text, uuid) TO anon, authenticated, service_role;
