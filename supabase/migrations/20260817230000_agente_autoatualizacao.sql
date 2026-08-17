-- Auto-atualizacao do agente.
--
-- Sem isto, atualizar mil academias exigiria mil acessos remotos transferindo
-- 38 MB cada. Com isto, publica-se uma versao e cada agente se atualiza sozinho
-- na proxima sincronizacao.
--
-- So o CODIGO viaja: os .mjs e o painel somam dezenas de KB. O node.exe nunca
-- muda e continua onde esta — o que tambem evita o arquivo travado que quebrou
-- a atualizacao manual.

CREATE TABLE IF NOT EXISTS public.agente_versoes (
  versao text PRIMARY KEY,
  -- { "agente.mjs": "...", "lib/nuvem.mjs": "...", "painel.html": "..." }
  arquivos jsonb NOT NULL,
  notas text,
  obrigatoria boolean NOT NULL DEFAULT true,
  publicada_em timestamptz NOT NULL DEFAULT now(),
  publicada_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ativa boolean NOT NULL DEFAULT true
);

ALTER TABLE public.agente_versoes ENABLE ROW LEVEL SECURITY;

-- Só admin master publica versão; ninguém mais precisa nem ler.
DROP POLICY IF EXISTS agente_versoes_admin ON public.agente_versoes;
CREATE POLICY agente_versoes_admin ON public.agente_versoes
  FOR ALL USING (public.is_master_admin_atual())
  WITH CHECK (public.is_master_admin_atual());

-- O agente pergunta se ha versao mais nova ---------------------------------
-- Devolve os arquivos so quando ha o que atualizar; caso contrario devolve
-- vazio, para nao trafegar codigo a toa a cada sincronizacao.

CREATE OR REPLACE FUNCTION public.academia_agente_atualizacao(
  p_agente_id uuid,
  p_segredo text,
  p_versao_atual text
)
RETURNS TABLE (versao text, arquivos jsonb, notas text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agente uuid;
BEGIN
  SELECT a.id INTO v_agente
    FROM public.academia_agentes a
   WHERE a.id = p_agente_id
     AND a.ativo
     AND a.segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF v_agente IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes a
     SET ultimo_contato_em = now(), versao = COALESCE(p_versao_atual, a.versao)
   WHERE a.id = v_agente;

  RETURN QUERY
  SELECT v.versao, v.arquivos, v.notas
    FROM public.agente_versoes v
   WHERE v.ativa
     -- comparacao textual serve porque as versoes sao zero-padded (1.00.02)
     AND v.versao > COALESCE(p_versao_atual, '')
   ORDER BY v.versao DESC
   LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_agente_atualizacao(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_atualizacao(uuid, text, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
