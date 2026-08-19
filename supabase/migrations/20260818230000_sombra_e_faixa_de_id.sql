-- Duas correcoes que o teste em campo de 18/08/2026 mostrou serem necessarias.
--
-- 1) A SOMBRA PRECISA SOBREVIVER AO REINICIO.
--    O agente compara a nossa decisao com a do sistema antigo, mas guardava o
--    resultado so na memoria, limitado a 100 entradas. Qualquer atualizacao ou
--    queda apagava tudo. "Rodar sombra ate a divergencia zerar" era impossivel
--    assim: a evidencia sumia antes de virar decisao.
--
-- 2) OS DOIS SISTEMAS SORTEAVAM ID DO MESMO SACO.
--    O Next Fit passou a criar aluno na faixa 900000 (maior visto: 900004) e o
--    academia_face_enfileirar escolhia "maior conhecido + 1". O proximo rosto
--    cadastrado pelo app pegaria 900005 — exatamente onde o Next Fit criaria o
--    proximo aluno. E o estrago seria silencioso: o agente trata "ja existe"
--    como sucesso e o passo seguinte SOBRESCREVE a foto de quem estava la.

-- ===========================================================================
-- 1) Registro de sombra
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.academia_sombra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  agente_id uuid REFERENCES public.academia_agentes(id) ON DELETE SET NULL,
  em timestamptz NOT NULL,
  referencia text NOT NULL,
  nome text,
  confianca integer,
  -- o que NOS teriamos decidido
  nosso text NOT NULL CHECK (nosso IN ('liberado', 'negado')),
  motivo text,
  -- o que o sistema ANTIGO respondeu. 'desconhecido' quando nao deu para ler:
  -- discordancia medida em cima de suposicao nao serve para decidir cutover.
  deles text NOT NULL CHECK (deles IN ('liberado', 'negado', 'desconhecido')),
  divergiu boolean NOT NULL,
  -- resposta crua, para auditar depois sem depender de interpretacao
  resposta text,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- A mesma passagem pode chegar duas vezes se o envio for repetido apos falha de
-- rede. A chave natural e agente + referencia + instante.
CREATE UNIQUE INDEX IF NOT EXISTS academia_sombra_unica
  ON public.academia_sombra (partner_id, referencia, em);

CREATE INDEX IF NOT EXISTS academia_sombra_recentes
  ON public.academia_sombra (partner_id, em DESC);

CREATE INDEX IF NOT EXISTS academia_sombra_divergentes
  ON public.academia_sombra (partner_id, em DESC) WHERE divergiu;

ALTER TABLE public.academia_sombra ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_sombra_acesso ON public.academia_sombra;
CREATE POLICY academia_sombra_acesso ON public.academia_sombra
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

CREATE OR REPLACE FUNCTION public.academia_agente_sombra_registrar(
  p_agente_id uuid,
  p_segredo text,
  p_registros jsonb
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a RECORD;
  r jsonb;
  v_total integer := 0;
BEGIN
  SELECT id, partner_id INTO a
    FROM public.academia_agentes
   WHERE id = p_agente_id AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes SET ultimo_contato_em = now() WHERE id = a.id;

  FOR r IN SELECT * FROM jsonb_array_elements(COALESCE(p_registros, '[]'::jsonb))
  LOOP
    INSERT INTO public.academia_sombra
      (partner_id, agente_id, em, referencia, nome, confianca,
       nosso, motivo, deles, divergiu, resposta)
    VALUES
      (a.partner_id, a.id,
       COALESCE((r->>'em')::timestamptz, now()),
       COALESCE(r->>'ref', ''),
       NULLIF(r->>'nome', ''),
       NULLIF(r->>'confianca', '')::integer,
       COALESCE(r->>'meu', 'negado'),
       NULLIF(r->>'motivo', ''),
       COALESCE(r->>'dele', 'desconhecido'),
       COALESCE((r->>'divergiu')::boolean, false),
       left(COALESCE(r->>'nextfit', ''), 2000))
    -- Indice unico, nao constraint: o alvo do ON CONFLICT tem que ser a lista
    -- de colunas, senao o Postgres nao encontra o "constraint".
    ON CONFLICT (partner_id, referencia, em) DO NOTHING;
    v_total := v_total + 1;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_agente_sombra_registrar(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_sombra_registrar(uuid, text, jsonb)
  TO anon, authenticated, service_role;

-- Placar pronto, para a tela nao ter que somar na mao.
CREATE OR REPLACE FUNCTION public.academia_sombra_placar(p_partner_id uuid)
RETURNS TABLE (comparadas bigint, divergencias bigint, primeira timestamptz, ultima timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FILTER (WHERE deles <> 'desconhecido'),
         count(*) FILTER (WHERE divergiu),
         min(em), max(em)
    FROM public.academia_sombra
   WHERE partner_id = p_partner_id
     AND public.academia_pode_ver(p_partner_id);
$$;

REVOKE EXECUTE ON FUNCTION public.academia_sombra_placar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_sombra_placar(uuid) TO authenticated, service_role;

-- ===========================================================================
-- 2) Faixa de id propria
-- ===========================================================================
-- A FitMind passa a numerar a partir de 700000. A faixa 1..421 e a 900000+ sao
-- do Next Fit. Escolher "maior conhecido + 1" sem faixa era entrar na fila do
-- outro sistema.

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
  c_base constant bigint := 700000;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(length(p_foto_base64), 0) < 1000 THEN
    RAISE EXCEPTION 'Foto ausente ou pequena demais.' USING ERRCODE = 'check_violation';
  END IF;

  -- Se o aluno ja tem credencial facial aqui, reaproveita: recadastrar rosto em
  -- id novo deixaria o antigo orfao dentro do leitor.
  SELECT c.referencia INTO v_ref
    FROM public.academia_credenciais c
   WHERE c.partner_id = p_partner_id AND c.tipo = 'facial'
     AND c.student_id = p_student_id AND c.ativo
   LIMIT 1;

  IF v_ref IS NULL THEN
    -- Maior id JA USADO POR NOS, ignorando o que vem do outro sistema.
    SELECT GREATEST(
             COALESCE((SELECT max(NULLIF(regexp_replace(c.referencia, '\D', '', 'g'), ''))::bigint
                         FROM public.academia_credenciais c
                        WHERE c.partner_id = p_partner_id
                          AND NULLIF(regexp_replace(c.referencia, '\D', '', 'g'), '')::bigint > c_base
                          AND NULLIF(regexp_replace(c.referencia, '\D', '', 'g'), '')::bigint < 800000), c_base),
             COALESCE((SELECT max(NULLIF(regexp_replace(e.referencia, '\D', '', 'g'), ''))::bigint
                         FROM public.academia_faces_envio e
                        WHERE e.partner_id = p_partner_id
                          AND NULLIF(regexp_replace(e.referencia, '\D', '', 'g'), '')::bigint > c_base
                          AND NULLIF(regexp_replace(e.referencia, '\D', '', 'g'), '')::bigint < 800000), c_base)
           )
      INTO v_maior;

    v_ref := (COALESCE(v_maior, c_base) + 1)::text;
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

REVOKE EXECUTE ON FUNCTION public.academia_face_enfileirar(uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_face_enfileirar(uuid, uuid, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Linha de conferencia (rodar depois de aplicar):
--   SELECT to_regclass('public.academia_sombra') AS tabela,
--          (SELECT count(*) FROM pg_proc WHERE proname='academia_agente_sombra_registrar') AS rpc_sombra,
--          (SELECT count(*) FROM pg_proc WHERE proname='academia_sombra_placar') AS rpc_placar,
--          (SELECT prosrc LIKE '%700000%' FROM pg_proc WHERE proname='academia_face_enfileirar') AS faixa_aplicada;
