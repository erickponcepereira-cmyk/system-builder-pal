-- Aluno de academia deixa de precisar ser usuario da plataforma.
--
-- POR QUE: o retrato da catraca saia de credencial -> student_id -> mensalidade,
-- e `students` exige profile_id NOT NULL UNIQUE e coach_id NOT NULL. Para os 400
-- alunos da Estacao entrarem na catraca pelo caminho velho, seria preciso criar
-- 400 perfis e pendurar cada um num coach — quebrando a invariante de que a
-- unidade so MONITORA quem frequenta, e o aluno pertence ao coach responsavel.
--
-- Aluno de academia e usuario do app sao coisas diferentes. Esta migration
-- separa as duas.
--
-- COMPATIBILIDADE: nada do que existia quebra. O retrato aceita as duas pontas,
-- entao mensalidade ligada a student_id continua valendo como sempre valeu.
--
-- Aplicada em producao em 19/08/2026 e escrita aqui depois, para que a conta
-- definitiva receba a mesma mudanca. E idempotente: rodar de novo nao estraga.

-- ===========================================================================
-- 1) As duas pontas
-- ===========================================================================

ALTER TABLE public.academia_mensalidades
  ADD COLUMN IF NOT EXISTS credencial_id uuid REFERENCES public.academia_credenciais(id) ON DELETE CASCADE;
ALTER TABLE public.academia_mensalidades ALTER COLUMN student_id DROP NOT NULL;

ALTER TABLE public.academia_frequencias
  ADD COLUMN IF NOT EXISTS credencial_id uuid REFERENCES public.academia_credenciais(id) ON DELETE CASCADE;
ALTER TABLE public.academia_frequencias ALTER COLUMN student_id DROP NOT NULL;

-- Uma das duas tem que existir, senao a linha nao pertence a ninguem.
ALTER TABLE public.academia_mensalidades DROP CONSTRAINT IF EXISTS academia_mensalidade_tem_dono;
ALTER TABLE public.academia_mensalidades ADD CONSTRAINT academia_mensalidade_tem_dono
  CHECK (student_id IS NOT NULL OR credencial_id IS NOT NULL);

ALTER TABLE public.academia_frequencias DROP CONSTRAINT IF EXISTS academia_frequencia_tem_dono;
ALTER TABLE public.academia_frequencias ADD CONSTRAINT academia_frequencia_tem_dono
  CHECK (student_id IS NOT NULL OR credencial_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS academia_mensalidades_credencial
  ON public.academia_mensalidades (credencial_id, status) WHERE credencial_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS academia_frequencias_credencial
  ON public.academia_frequencias (credencial_id, entrada_em DESC) WHERE credencial_id IS NOT NULL;

-- Telefone do aluno de academia. Ele nao tem perfil na plataforma, entao o
-- numero para o robo falar com ele mora aqui.
ALTER TABLE public.academia_credenciais ADD COLUMN IF NOT EXISTS telefone text;

-- Procedencia da mensalidade importada. NAO usar a coluna `origem` para isso:
-- ela tem CHECK fechado em ('interna','externa') e significa outra coisa —
-- se a cobranca passou pela plataforma ou nao.
ALTER TABLE public.academia_mensalidades ADD COLUMN IF NOT EXISTS importado_de text;

DROP INDEX IF EXISTS public.academia_mensalidade_importada_unica;
CREATE UNIQUE INDEX academia_mensalidade_importada_unica
  ON public.academia_mensalidades (credencial_id, importado_de)
  WHERE credencial_id IS NOT NULL AND importado_de IS NOT NULL;

-- ===========================================================================
-- 2) O retrato passa a aceitar as duas pontas
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.academia_agente_retrato(p_agente_id uuid, p_segredo text)
RETURNS TABLE (ref text, ate date)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE a RECORD; v_carencia integer;
BEGIN
  SELECT id, partner_id INTO a FROM public.academia_agentes
   WHERE id = p_agente_id AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.academia_agentes SET ultimo_contato_em = now(), ultima_sync_em = now() WHERE id = a.id;

  SELECT COALESCE(c.dias_carencia, 3) INTO v_carencia
    FROM public.partner_acesso_config c WHERE c.partner_id = a.partner_id;
  v_carencia := COALESCE(v_carencia, 3);

  RETURN QUERY
  SELECT cr.referencia, (max(m.valido_ate) + v_carencia)::date
    FROM public.academia_credenciais cr
    JOIN public.academia_mensalidades m
      ON m.partner_id = cr.partner_id
     AND m.status = 'ativa'
     -- Mensalidade da credencial (aluno so da academia) OU do aluno da
     -- plataforma, que continua valendo como sempre valeu.
     AND (m.credencial_id = cr.id
          OR (m.credencial_id IS NULL AND cr.student_id IS NOT NULL AND m.student_id = cr.student_id))
   WHERE cr.partner_id = a.partner_id AND cr.ativo
   GROUP BY cr.referencia;
END; $$;

-- ===========================================================================
-- 3) Frequencia sem aluno da plataforma — e um defeito corrigido
-- ===========================================================================
-- Antes, "liberado sem aluno vinculado" caia no ramo de NEGADO: o sistema
-- registrava como barrada uma pessoa que tinha entrado.

CREATE OR REPLACE FUNCTION public.academia_agente_enviar(p_agente_id uuid, p_segredo text, p_eventos jsonb)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE a RECORD; e jsonb; cr RECORD; v_em timestamptz; v_total integer := 0;
BEGIN
  SELECT id, partner_id INTO a FROM public.academia_agentes
   WHERE id = p_agente_id AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.academia_agentes SET ultimo_contato_em = now() WHERE id = a.id;

  FOR e IN SELECT * FROM jsonb_array_elements(COALESCE(p_eventos, '[]'::jsonb))
  LOOP
    SELECT c.id, c.student_id INTO cr
      FROM public.academia_credenciais c
     WHERE c.partner_id = a.partner_id AND c.referencia = (e->>'ref')
     LIMIT 1;
    v_em := COALESCE((e->>'em')::timestamptz, now());

    IF COALESCE(e->>'resultado', '') = 'liberado' AND cr.id IS NOT NULL THEN
      INSERT INTO public.academia_frequencias (partner_id, student_id, credencial_id, origem, entrada_em)
      SELECT a.partner_id, cr.student_id, cr.id, COALESCE(e->>'origem', 'catraca'), v_em
       WHERE NOT EXISTS (
         SELECT 1 FROM public.academia_frequencias f
          WHERE f.partner_id = a.partner_id AND f.credencial_id = cr.id AND f.entrada_em = v_em
       );
    ELSE
      INSERT INTO public.academia_acessos_negados
        (partner_id, student_id, referencia, motivo, origem, tentado_em)
      VALUES (a.partner_id, cr.student_id, e->>'ref',
              COALESCE(e->>'motivo', 'desconhecido'), COALESCE(e->>'origem', 'catraca'), v_em);
    END IF;
    v_total := v_total + 1;
  END LOOP;
  RETURN v_total;
END; $$;

-- ===========================================================================
-- 4) Porta de importacao de contratos
-- ===========================================================================
-- Existe para que a planilha do sistema antigo va do disco de quem instala
-- direto para o banco, sem os dados pessoais passarem por intermediario nenhum.
-- O token e sorteado por quem vai importar, guardado so como hash, e expira.

CREATE TABLE IF NOT EXISTS public.academia_import_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expira_em timestamptz NOT NULL,
  usos integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.academia_import_tokens ENABLE ROW LEVEL SECURITY;
-- Sem policy de leitura de proposito: ninguem precisa ler token, nem o dono.

CREATE OR REPLACE FUNCTION public.academia_importar_contratos(
  p_partner_id uuid, p_token text, p_linhas jsonb
) RETURNS TABLE (casados integer, sem_credencial integer, mensalidades integer, telefones integer)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  t RECORD; l jsonb; cr RECORD;
  v_norm text; v_fim date; v_casados int := 0; v_sem int := 0; v_mens int := 0; v_tel int := 0;
BEGIN
  SELECT * INTO t FROM public.academia_import_tokens
   WHERE partner_id = p_partner_id
     AND token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     AND expira_em > now();
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'Token de importacao invalido ou expirado.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE public.academia_import_tokens SET usos = usos + 1 WHERE id = t.id;

  FOR l IN SELECT * FROM jsonb_array_elements(COALESCE(p_linhas, '[]'::jsonb))
  LOOP
    -- Casa pelo nome que o proprio leitor conhece: os dois lados vem do mesmo
    -- sistema antigo, entao a grafia bate. Normalizacao so de espaco e caixa.
    v_norm := upper(btrim(regexp_replace(COALESCE(l->>'nome',''), '\s+', ' ', 'g')));
    v_fim := NULLIF(l->>'fim','')::date;

    SELECT c.id INTO cr FROM public.academia_credenciais c
     WHERE c.partner_id = p_partner_id
       AND upper(btrim(regexp_replace(COALESCE(c.nome_no_equipamento,''), '\s+', ' ', 'g'))) = v_norm
     LIMIT 1;

    IF cr.id IS NULL THEN v_sem := v_sem + 1; CONTINUE; END IF;
    v_casados := v_casados + 1;

    IF COALESCE(l->>'telefone','') <> '' THEN
      UPDATE public.academia_credenciais SET telefone = l->>'telefone' WHERE id = cr.id;
      v_tel := v_tel + 1;
    END IF;

    IF v_fim IS NOT NULL THEN
      -- origem 'externa' e forma 'outro' porque a cobranca aconteceu fora da
      -- plataforma; a procedencia real fica em importado_de.
      INSERT INTO public.academia_mensalidades
        (partner_id, student_id, credencial_id, plano, valor, valido_ate,
         origem, forma_pagamento, status, importado_de, observacao)
      VALUES (p_partner_id, NULL, cr.id, COALESCE(NULLIF(l->>'plano',''),'Importado'), 0, v_fim,
              'externa', 'outro', 'ativa', 'nextfit',
              'Importado do Next Fit em ' || to_char(now(),'DD/MM/YYYY'))
      ON CONFLICT (credencial_id, importado_de) WHERE credencial_id IS NOT NULL AND importado_de IS NOT NULL
      -- Reimportar e seguro: fica sempre a data mais longa ja vista.
      DO UPDATE SET valido_ate = GREATEST(public.academia_mensalidades.valido_ate, EXCLUDED.valido_ate),
                    plano = EXCLUDED.plano, updated_at = now();
      v_mens := v_mens + 1;
    END IF;
  END LOOP;

  casados := v_casados; sem_credencial := v_sem; mensalidades := v_mens; telefones := v_tel;
  RETURN NEXT;
END; $$;

REVOKE EXECUTE ON FUNCTION public.academia_importar_contratos(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_importar_contratos(uuid, text, jsonb) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Linha de conferencia (rodar depois de aplicar; deve dar tudo YES/1/true):
--   SELECT
--     (SELECT is_nullable FROM information_schema.columns
--       WHERE table_name='academia_mensalidades' AND column_name='student_id')   AS mens_student_opcional,
--     (SELECT count(*) FROM information_schema.columns
--       WHERE table_name='academia_mensalidades' AND column_name='credencial_id') AS mens_credencial,
--     (SELECT is_nullable FROM information_schema.columns
--       WHERE table_name='academia_frequencias' AND column_name='student_id')     AS freq_student_opcional,
--     (SELECT count(*) FROM information_schema.columns
--       WHERE table_name='academia_credenciais' AND column_name='telefone')       AS col_telefone,
--     (SELECT prosrc LIKE '%m.credencial_id = cr.id%' FROM pg_proc
--       WHERE proname='academia_agente_retrato')                                  AS retrato_aceita_credencial,
--     (SELECT prosrc LIKE '%cr.id IS NOT NULL%' FROM pg_proc
--       WHERE proname='academia_agente_enviar')                                   AS enviar_corrigido;
