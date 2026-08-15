-- Corrige "column reference partner_id is ambiguous" no pareamento.
--
-- A funcao declara partner_id como coluna de RETORNO e le partner_id da tabela.
-- Dentro do corpo, plpgsql nao sabe a qual dos dois me refiro.
--
-- Correcao: as colunas de retorno ganham prefixo o_, e toda leitura de tabela
-- fica qualificada pelo alias. Nada muda para quem chama: a forma do retorno
-- continua (agente_id, partner_id, segredo), porque o nome externo vem do
-- RETURNS TABLE.

DROP FUNCTION IF EXISTS public.academia_agente_parear(text, text);

CREATE OR REPLACE FUNCTION public.academia_agente_parear(p_codigo text, p_versao text)
RETURNS TABLE (agente_id uuid, partner_id uuid, segredo text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_partner uuid;
  v_segredo text;
BEGIN
  SELECT a.id, a.partner_id
    INTO v_id, v_partner
    FROM public.academia_agentes a
   WHERE a.codigo_pareamento = upper(trim(p_codigo))
     AND a.pareado_em IS NULL
     AND a.codigo_expira_em > now()
   FOR UPDATE;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Codigo invalido ou expirado.' USING ERRCODE = 'no_data_found';
  END IF;

  v_segredo := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');

  UPDATE public.academia_agentes a
     SET segredo_hash = encode(sha256(convert_to(v_segredo, 'UTF8')), 'hex'),
         pareado_em = now(),
         ultimo_contato_em = now(),
         versao = p_versao,
         -- o codigo morre no resgate: uso unico
         codigo_pareamento = NULL,
         codigo_expira_em = NULL
   WHERE a.id = v_id;

  agente_id := v_id;
  partner_id := v_partner;
  segredo := v_segredo;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_agente_parear(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.academia_agente_parear(text, text)
  TO anon, authenticated, service_role;
