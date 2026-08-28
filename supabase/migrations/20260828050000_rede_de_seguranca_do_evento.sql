-- A compra de evento tambem precisa de rede de seguranca.
--
-- O gatilho de `transactions` roda uma vez: no INSERT ja pago, ou na virada
-- para pago. Se naquele instante `academia_pagamento_confirmado` ainda disser
-- que nao — porque o webhook do Mercado Pago chega depois —, a funcao devolve
-- false e ninguem tenta de novo. A mensalidade tem
-- `academia_mensalidades_pendentes_reprocessar` exatamente para isso desde
-- 13/08; o evento nasceu ontem sem equivalente.
--
-- Sem ela, uma pessoa paga o evento e simplesmente nao recebe a credencial de
-- entrada. Ninguem descobre ate ela chegar na porta.

CREATE OR REPLACE FUNCTION public.academia_evento_inscricoes_pendentes_reprocessar(p_partner_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_total integer := 0;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  FOR r IN
    SELECT t.id
      FROM public.transactions t
      JOIN public.academia_produtos_evento m
        ON m.product_id = t.product_id AND m.ativo AND m.partner_id = p_partner_id
     WHERE t.status = 'paid'
       AND NOT EXISTS (
         SELECT 1 FROM public.academia_evento_inscricoes i WHERE i.transaction_id = t.id
       )
  LOOP
    -- Chama a mesma funcao do gatilho. Nao adianta reescrever o status para
    -- 'paid': o gatilho de UPDATE so dispara quando o status MUDA, e aqui ele
    -- ja e 'paid'.
    IF public.academia_evento_inscricao_gerar(r.id) THEN
      v_total := v_total + 1;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_evento_inscricoes_pendentes_reprocessar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_evento_inscricoes_pendentes_reprocessar(uuid) TO authenticated, service_role;
