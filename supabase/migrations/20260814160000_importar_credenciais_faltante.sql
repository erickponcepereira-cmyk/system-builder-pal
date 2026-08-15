-- Cria o que ficou faltando da importacao de credenciais.
--
-- A migration 20260814120000 nao chegou a rodar no banco, e nao pode mais ser
-- rodada como esta: ela carrega uma versao antiga de academia_credencial_sugestoes
-- — a que devolvia e-mail de alunos de qualquer academia. Rodar agora tentaria
-- substituir a versao corrigida em 20260814150000, falharia por diferenca de
-- tipo de retorno (42P13) e deixaria o banco no meio do caminho.
--
-- Este arquivo cria apenas as colunas e a funcao de importar, sem encostar em
-- academia_credencial_sugestoes.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.academia_credenciais
  ADD COLUMN IF NOT EXISTS nome_no_equipamento text,
  ADD COLUMN IF NOT EXISTS importado_em timestamptz;

-- Sem student_id a credencial existe mas nao libera ninguem: fica esperando
-- vinculo. E o estado normal logo depois da importacao.
CREATE INDEX IF NOT EXISTS academia_credenciais_sem_vinculo_idx
  ON public.academia_credenciais (partner_id)
  WHERE student_id IS NULL;

-- O agente manda a lista lida do leitor. O partner_id vem do SEGREDO do agente,
-- nunca de parametro: um agente so consegue gravar na academia dele.
CREATE OR REPLACE FUNCTION public.academia_agente_credenciais_importar(
  p_agente_id uuid,
  p_segredo text,
  p_usuarios jsonb
)
RETURNS TABLE (novas integer, atualizadas integer, total integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agente uuid;
  v_partner uuid;
  u jsonb;
  v_novas integer := 0;
  v_atu integer := 0;
  v_total integer := 0;
  v_existe boolean;
BEGIN
  SELECT a.id, a.partner_id
    INTO v_agente, v_partner
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id
     AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF v_agente IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes a SET ultimo_contato_em = now() WHERE a.id = v_agente;

  FOR u IN SELECT * FROM jsonb_array_elements(COALESCE(p_usuarios, '[]'::jsonb))
  LOOP
    CONTINUE WHEN COALESCE(u->>'id', '') = '';
    v_total := v_total + 1;

    SELECT EXISTS (
      SELECT 1 FROM public.academia_credenciais c
       WHERE c.partner_id = v_partner AND c.tipo = 'facial' AND c.referencia = (u->>'id')
    ) INTO v_existe;

    INSERT INTO public.academia_credenciais
      (partner_id, tipo, referencia, nome_no_equipamento, importado_em, ativo)
    VALUES
      (v_partner, 'facial', u->>'id', NULLIF(trim(COALESCE(u->>'name','')), ''), now(), true)
    ON CONFLICT ON CONSTRAINT academia_credencial_unica DO UPDATE
      -- so atualiza o nome vindo do equipamento; NUNCA mexe no vinculo que
      -- alguem ja fez a mao
      SET nome_no_equipamento = COALESCE(EXCLUDED.nome_no_equipamento,
                                         public.academia_credenciais.nome_no_equipamento),
          importado_em = now();

    IF v_existe THEN v_atu := v_atu + 1; ELSE v_novas := v_novas + 1; END IF;
  END LOOP;

  novas := v_novas; atualizadas := v_atu; total := v_total;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_agente_credenciais_importar(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_credenciais_importar(uuid, text, jsonb)
  TO anon, authenticated, service_role;

-- Avisa o PostgREST para recarregar o cache de schema na hora.
NOTIFY pgrst, 'reload schema';
