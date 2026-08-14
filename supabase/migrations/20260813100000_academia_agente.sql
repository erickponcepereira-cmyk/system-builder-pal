-- Lado de nuvem do agente da catraca.
--
-- O agente roda no PC da academia porque a porta serial e local. Ele deve ser
-- MINIMO E BURRO: nenhuma regra de negocio, nenhum dado sensivel. Quem fizer
-- engenharia reversa dele encontra uma lista de identificadores e datas — nao a
-- base de alunos, nem contrato, nem valor, nem CPF.
--
-- Toda a regra continua no banco. O agente so pergunta "esse identificador pode
-- entrar hoje?" e compara com uma data.

-- 1. O agente ----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.academia_agentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'PC da recepcao',
  -- codigo curto que o operador digita no programa recem-instalado
  codigo_pareamento text UNIQUE,
  codigo_expira_em timestamptz,
  -- o segredo vive so no PC. Aqui fica o hash.
  segredo_hash text,
  pareado_em timestamptz,
  ultimo_contato_em timestamptz,
  ultima_sync_em timestamptz,
  versao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academia_agentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_agentes_acesso ON public.academia_agentes;
CREATE POLICY academia_agentes_acesso ON public.academia_agentes
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- 2. Credenciais: quem e quem para o equipamento -----------------------------
-- A ponte entre o aluno da FitMind e o identificador que o leitor conhece.
-- E so isso que o agente recebe.

CREATE TABLE IF NOT EXISTS public.academia_credenciais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'facial' CHECK (tipo IN ('facial', 'qrcode', 'pin')),
  -- id do usuario dentro do equipamento, ou token do QR
  referencia text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_credencial_unica UNIQUE (partner_id, tipo, referencia)
);

ALTER TABLE public.academia_credenciais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_credenciais_acesso ON public.academia_credenciais;
CREATE POLICY academia_credenciais_acesso ON public.academia_credenciais
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- 3. Quem tentou e nao entrou ------------------------------------------------
-- A recepcao precisa disso na tela quando o aluno reclama na porta.

CREATE TABLE IF NOT EXISTS public.academia_acessos_negados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  referencia text,
  motivo text NOT NULL,
  origem text NOT NULL DEFAULT 'catraca',
  tentado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS academia_acessos_negados_idx
  ON public.academia_acessos_negados (partner_id, tentado_em DESC);

ALTER TABLE public.academia_acessos_negados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_negados_acesso ON public.academia_acessos_negados;
CREATE POLICY academia_negados_acesso ON public.academia_acessos_negados
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- 4. Pareamento --------------------------------------------------------------
-- A academia gera um codigo curto; o operador digita no programa instalado.

CREATE OR REPLACE FUNCTION public.academia_agente_gerar_codigo(p_partner_id uuid, p_nome text)
RETURNS TABLE (agente_id uuid, codigo text, expira_em timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_codigo text;
  v_id uuid;
  v_exp timestamptz := now() + interval '30 minutes';
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 8 caracteres sem ambiguidade visual: sem O/0, I/1
  v_codigo := upper(translate(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8),
                              'o0i1l', 'PQRST'));

  INSERT INTO public.academia_agentes (partner_id, nome, codigo_pareamento, codigo_expira_em)
  VALUES (p_partner_id, COALESCE(NULLIF(trim(p_nome), ''), 'PC da recepcao'), v_codigo, v_exp)
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_codigo, v_exp;
END;
$$;

-- Resgate do codigo pelo proprio programa. Nao exige login: o codigo E o
-- segredo, e ele e de uso unico e expira em 30 minutos.
CREATE OR REPLACE FUNCTION public.academia_agente_parear(p_codigo text, p_versao text)
RETURNS TABLE (agente_id uuid, partner_id uuid, segredo text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  v_segredo text;
BEGIN
  SELECT id, partner_id INTO a
    FROM public.academia_agentes
   WHERE codigo_pareamento = upper(trim(p_codigo))
     AND pareado_em IS NULL
     AND codigo_expira_em > now()
   FOR UPDATE;

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Codigo invalido ou expirado.' USING ERRCODE = 'no_data_found';
  END IF;

  v_segredo := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.academia_agentes
     SET segredo_hash = encode(sha256(convert_to(v_segredo, 'UTF8')), 'hex'),
         pareado_em = now(),
         ultimo_contato_em = now(),
         versao = p_versao,
         -- o codigo morre no resgate: uso unico
         codigo_pareamento = NULL,
         codigo_expira_em = NULL
   WHERE id = a.id;

  RETURN QUERY SELECT a.id, a.partner_id, v_segredo;
END;
$$;

-- 5. O retrato que o agente baixa -------------------------------------------
--
-- Uma linha por credencial: o identificador que o equipamento conhece e a
-- ultima data em que ele pode entrar. Mais nada.
--
-- 'ate' ja inclui a carencia, entao o agente nao precisa saber o que carencia e.
-- Ele compara data com hoje e pronto. Toda a regua fica no banco.

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
    FROM public.partner_acesso_config c WHERE c.partner_id = a.partner_id;
  v_carencia := COALESCE(v_carencia, 3);

  RETURN QUERY
  SELECT cr.referencia,
         (max(m.valido_ate) + v_carencia)::date
    FROM public.academia_credenciais cr
    JOIN public.academia_mensalidades m
      ON m.student_id = cr.student_id
     AND m.partner_id = cr.partner_id
     AND m.status = 'ativa'
   WHERE cr.partner_id = a.partner_id
     AND cr.ativo
   GROUP BY cr.referencia;
END;
$$;

-- 6. O que o agente sobe -----------------------------------------------------
-- Entradas e tentativas negadas, em lote. Idempotente pelo horario exato da
-- entrada: reenviar o mesmo lote nao duplica frequencia.

CREATE OR REPLACE FUNCTION public.academia_agente_enviar(
  p_agente_id uuid,
  p_segredo text,
  p_eventos jsonb
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  e jsonb;
  v_student uuid;
  v_total integer := 0;
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

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_eventos, '[]'::jsonb))
  LOOP
    SELECT cr.student_id INTO v_student
      FROM public.academia_credenciais cr
     WHERE cr.partner_id = a.partner_id AND cr.referencia = (e->>'ref')
     LIMIT 1;

    IF COALESCE(e->>'resultado', '') = 'liberado' AND v_student IS NOT NULL THEN
      INSERT INTO public.academia_frequencias (partner_id, student_id, origem, entrada_em)
      SELECT a.partner_id, v_student, COALESCE(e->>'origem', 'catraca'),
             COALESCE((e->>'em')::timestamptz, now())
       WHERE NOT EXISTS (
         SELECT 1 FROM public.academia_frequencias f
          WHERE f.partner_id = a.partner_id
            AND f.student_id = v_student
            AND f.entrada_em = COALESCE((e->>'em')::timestamptz, now())
       );
    ELSE
      INSERT INTO public.academia_acessos_negados
        (partner_id, student_id, referencia, motivo, origem, tentado_em)
      VALUES (a.partner_id, v_student, e->>'ref',
              COALESCE(e->>'motivo', 'desconhecido'),
              COALESCE(e->>'origem', 'catraca'),
              COALESCE((e->>'em')::timestamptz, now()));
    END IF;

    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_agente_gerar_codigo(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_agente_gerar_codigo(uuid, text) TO authenticated, service_role;

-- Estas tres sao chamadas pelo programa, que nao tem login de usuario. A
-- autenticacao delas e o proprio segredo, conferido dentro da funcao.
GRANT EXECUTE ON FUNCTION public.academia_agente_parear(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_agente_retrato(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_agente_enviar(uuid, text, jsonb) TO anon, authenticated, service_role;
