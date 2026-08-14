-- Importar quem ja esta cadastrado no leitor facial.
--
-- O leitor da academia ja tem os rostos gravados. Nao ha motivo para recadastrar
-- ninguem: basta trazer a lista de identificadores e ligar cada um a um aluno da
-- plataforma — o mesmo padrao do vinculo em avaliar aluno.
--
-- A biometria em si NUNCA sai do equipamento. So vem id e nome.

-- Necessaria para sugerir vinculo por semelhanca de nome.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.academia_credenciais
  ADD COLUMN IF NOT EXISTS nome_no_equipamento text,
  ADD COLUMN IF NOT EXISTS importado_em timestamptz;

-- Sem student_id, a credencial existe mas nao libera ninguem: fica esperando
-- vinculo. E o estado normal logo depois da importacao.
CREATE INDEX IF NOT EXISTS academia_credenciais_sem_vinculo_idx
  ON public.academia_credenciais (partner_id)
  WHERE student_id IS NULL;

-- O agente manda a lista lida do leitor -------------------------------------

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
  a RECORD;
  u jsonb;
  v_novas integer := 0;
  v_atu integer := 0;
  v_total integer := 0;
  v_existe boolean;
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

  FOR u IN SELECT * FROM jsonb_array_elements(COALESCE(p_usuarios, '[]'::jsonb))
  LOOP
    CONTINUE WHEN COALESCE(u->>'id', '') = '';
    v_total := v_total + 1;

    SELECT EXISTS (
      SELECT 1 FROM public.academia_credenciais c
       WHERE c.partner_id = a.partner_id AND c.tipo = 'facial' AND c.referencia = (u->>'id')
    ) INTO v_existe;

    INSERT INTO public.academia_credenciais
      (partner_id, tipo, referencia, nome_no_equipamento, importado_em, ativo)
    VALUES
      (a.partner_id, 'facial', u->>'id', NULLIF(trim(COALESCE(u->>'name','')), ''), now(), true)
    ON CONFLICT ON CONSTRAINT academia_credencial_unica DO UPDATE
      -- so atualiza o nome vindo do equipamento; NUNCA mexe no vinculo que
      -- alguem ja fez a mao
      SET nome_no_equipamento = COALESCE(EXCLUDED.nome_no_equipamento,
                                         public.academia_credenciais.nome_no_equipamento),
          importado_em = now();

    IF v_existe THEN v_atu := v_atu + 1; ELSE v_novas := v_novas + 1; END IF;
  END LOOP;

  RETURN QUERY SELECT v_novas, v_atu, v_total;
END;
$$;

-- Sugestao de vinculo por semelhanca de nome --------------------------------
-- Nao vincula nada sozinho: so ordena os candidatos para a pessoa escolher.
-- Vinculo errado manda o aluno errado para dentro da academia.

CREATE OR REPLACE FUNCTION public.academia_credencial_sugestoes(
  p_partner_id uuid,
  p_credencial_id uuid
)
RETURNS TABLE (student_id uuid, nome text, email text, semelhanca real)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.nome_no_equipamento INTO v_nome
    FROM public.academia_credenciais c
   WHERE c.id = p_credencial_id AND c.partner_id = p_partner_id;

  IF COALESCE(trim(v_nome), '') = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id, pr.name::text, pr.email::text,
         similarity(lower(pr.name), lower(v_nome)) AS sem
    FROM public.students s
    JOIN public.profiles pr ON pr.id = s.profile_id
   WHERE pr.name IS NOT NULL
     AND similarity(lower(pr.name), lower(v_nome)) > 0.25
   ORDER BY sem DESC, pr.name
   LIMIT 8;
END;
$$;

GRANT EXECUTE ON FUNCTION public.academia_agente_credenciais_importar(uuid, text, jsonb)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_credencial_sugestoes(uuid, uuid)
  TO authenticated, service_role;
