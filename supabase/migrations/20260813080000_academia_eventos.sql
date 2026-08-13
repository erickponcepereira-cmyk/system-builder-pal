-- Eventos avulsos da academia (aulao, workshop, open day).
--
-- Aceita quem ja paga mensalidade e quem vem de fora. O acesso pode ser por QR
-- ou por rosto, escolha da academia.
--
-- LGPD, e o motivo de tanto cuidado aqui: cadastrar o rosto de quem NAO e aluno,
-- so para deixar entrar num sabado, e tratamento de biometria de terceiro. Tem
-- finalidade determinada (aquele evento), prazo curto e obrigacao de apagar.
-- Por isso o prazo de remocao nasce junto com a inscricao, e nao depende de
-- alguem lembrar depois.
--
-- LIMITE HONESTO: esta migration guarda a DECISAO e o PRAZO. Quem apaga o rosto
-- no equipamento e o agente local, que ainda nao existe. Enquanto ele nao
-- existir, academia_faces_a_remover e a lista do que esta pendente — e ela
-- precisa ser olhada por gente.

CREATE TABLE IF NOT EXISTS public.academia_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  data_evento date NOT NULL,
  hora_inicio time,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  -- como o participante entra no dia
  acesso text NOT NULL DEFAULT 'qrcode' CHECK (acesso IN ('qrcode', 'facial', 'ambos')),
  -- o que acontece com o rosto de quem nao e aluno
  face_politica text NOT NULL DEFAULT 'uma_leitura'
    CHECK (face_politica IN ('uma_leitura', 'apagar_24h')),
  aberto_a_nao_alunos boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academia_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_eventos_acesso ON public.academia_eventos;
CREATE POLICY academia_eventos_acesso ON public.academia_eventos
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- Inscricoes -----------------------------------------------------------------
-- student_id nulo = veio de fora. CPF so como hash, igual ao day-use.

CREATE TABLE IF NOT EXISTS public.academia_evento_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.academia_eventos(id) ON DELETE CASCADE,
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  nome text NOT NULL,
  cpf_hash text,
  cpf_final text,
  telefone text,
  valor numeric(12,2) NOT NULL DEFAULT 0,
  forma_pagamento text,
  taxa_percentual numeric(6,4) NOT NULL DEFAULT 0,
  taxa_valor numeric(12,2) NOT NULL DEFAULT 0,
  valor_liquido numeric(12,2) NOT NULL DEFAULT 0,
  -- credencial que o leitor valida; unica no sistema inteiro
  credencial text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  usado_em timestamptz,
  -- ciclo de vida do rosto
  face_enviada_em timestamptz,
  face_remover_ate timestamptz,
  face_removida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academia_evento_inscricoes_idx
  ON public.academia_evento_inscricoes (partner_id, evento_id);

ALTER TABLE public.academia_evento_inscricoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_evento_inscricoes_acesso ON public.academia_evento_inscricoes;
CREATE POLICY academia_evento_inscricoes_acesso ON public.academia_evento_inscricoes
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- Validar a entrada ----------------------------------------------------------
-- Consome a credencial na hora, dentro da transacao: duas leituras simultaneas
-- da mesma credencial nao passam as duas.

CREATE OR REPLACE FUNCTION public.academia_evento_validar(
  p_partner_id uuid,
  p_credencial text
)
RETURNS TABLE (decisao text, motivo text, nome text, evento text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_nome text;
  v_evento text;
  v_data date;
  v_usado timestamptz;
  v_tz text;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');

  SELECT i.id, i.nome, e.nome, e.data_evento, i.usado_em
    INTO v_id, v_nome, v_evento, v_data, v_usado
    FROM public.academia_evento_inscricoes i
    JOIN public.academia_eventos e ON e.id = i.evento_id
   WHERE i.partner_id = p_partner_id
     AND i.credencial = trim(p_credencial)
     AND e.ativo
   FOR UPDATE OF i;

  IF v_id IS NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'credencial_invalida'::text, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF v_usado IS NOT NULL THEN
    RETURN QUERY SELECT 'negado'::text, 'ja_utilizada'::text, v_nome, v_evento;
    RETURN;
  END IF;

  IF v_data <> (now() AT TIME ZONE v_tz)::date THEN
    RETURN QUERY SELECT 'negado'::text, 'fora_da_data'::text, v_nome, v_evento;
    RETURN;
  END IF;

  UPDATE public.academia_evento_inscricoes SET usado_em = now() WHERE id = v_id;

  RETURN QUERY SELECT 'liberado'::text, 'entrada_liberada'::text, v_nome, v_evento;
END;
$$;

-- Rostos a apagar ------------------------------------------------------------
-- 'uma_leitura'  -> apagar assim que a credencial for usada
-- 'apagar_24h'   -> apagar 24h depois do envio, tenha entrado ou nao
--
-- Esta funcao NAO apaga nada no equipamento: ela lista o que esta vencido para
-- quem for apagar. Enquanto o agente local nao existir, a lista e uma tarefa
-- humana, e e melhor que ela seja visivel do que silenciosa.

CREATE OR REPLACE FUNCTION public.academia_faces_a_remover(p_partner_id uuid)
RETURNS TABLE (
  inscricao_id uuid,
  nome text,
  evento text,
  politica text,
  vencido_desde timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT i.id, i.nome, e.nome, e.face_politica,
         CASE WHEN e.face_politica = 'uma_leitura' THEN i.usado_em ELSE i.face_remover_ate END
    FROM public.academia_evento_inscricoes i
    JOIN public.academia_eventos e ON e.id = i.evento_id
   WHERE i.partner_id = p_partner_id
     AND i.face_enviada_em IS NOT NULL
     AND i.face_removida_em IS NULL
     AND (
       (e.face_politica = 'uma_leitura' AND i.usado_em IS NOT NULL)
       OR (e.face_politica = 'apagar_24h' AND i.face_remover_ate <= now())
     )
   ORDER BY 5;
END;
$$;

-- Prazo nasce junto com o envio do rosto, para nao depender de alguem lembrar.
CREATE OR REPLACE FUNCTION public.academia_face_prazo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.face_enviada_em IS NOT NULL AND NEW.face_remover_ate IS NULL THEN
    NEW.face_remover_ate := NEW.face_enviada_em + interval '24 hours';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_academia_face_prazo ON public.academia_evento_inscricoes;
CREATE TRIGGER trg_academia_face_prazo
  BEFORE INSERT OR UPDATE OF face_enviada_em ON public.academia_evento_inscricoes
  FOR EACH ROW EXECUTE FUNCTION public.academia_face_prazo();

REVOKE EXECUTE ON FUNCTION public.academia_evento_validar(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_faces_a_remover(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.academia_evento_validar(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_faces_a_remover(uuid) TO authenticated, service_role;
