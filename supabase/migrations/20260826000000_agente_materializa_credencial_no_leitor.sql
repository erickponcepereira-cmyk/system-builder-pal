-- O agente passa a criar no leitor quem foi cadastrado na recepção.
--
-- O cadastro de balcão cria a pessoa só na nuvem. O leitor não sabe que ela
-- existe, então nunca reporta o id dela — e a catraca nunca chega a ser
-- acionada. Mensalidade em dia, retrato correto, pessoa parada na porta.
--
-- Quem fecha esse buraco tem que ser o agente: é o único que fala com o
-- equipamento. Esta função é a lista de trabalho dele.
--
-- Devolve nome, e isso é deliberado: para criar o usuário no leitor é preciso
-- um nome, e o agente já lê todos os nomes do próprio equipamento. Não é dado
-- novo na máquina da academia — é o mesmo dado, vindo da outra direção.

CREATE OR REPLACE FUNCTION public.academia_agente_credenciais_pendentes(
  p_agente_id uuid,
  p_segredo   text
)
RETURNS TABLE(referencia text, nome text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE a RECORD;
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
  SELECT cr.referencia,
         COALESCE(NULLIF(btrim(cr.nome_no_equipamento), ''), 'Aluno ' || cr.referencia)
    FROM public.academia_credenciais cr
   WHERE cr.partner_id = a.partner_id
     AND cr.ativo
     -- `importado_em` só é preenchido quando a pessoa foi LIDA do equipamento.
     -- Nulo significa que ela nasceu na recepção e nunca existiu lá.
     AND cr.importado_em IS NULL
   ORDER BY cr.created_at
   LIMIT 50;
END;
$function$;
