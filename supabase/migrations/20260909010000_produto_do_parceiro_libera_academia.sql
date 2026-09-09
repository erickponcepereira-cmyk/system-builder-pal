-- Produto do parceiro tambem libera mensalidade de academia.
--
-- Sintoma que o Erick viu: em "produtos que liberam", a busca nao acha os
-- produtos que a academia criou. A causa tem TRES camadas, e consertar so a
-- primeira seria armadilha -- ele vincularia o produto e a compra nunca geraria
-- mensalidade, em silencio.
--
-- 1. A BUSCA olhava `products`, o catalogo da plataforma. O que a academia cria
--    vive em `partner_products`, outra tabela. (Corrigido no TypeScript.)
--
-- 2. A CHAVE ESTRANGEIRA de academia_produtos_mensalidade.product_id aponta para
--    `products`. Mesmo achando o produto, salvar quebraria.
--
-- 3. O GERADOR academia_mensalidade_gerar e dirigido por TRANSACAO: le
--    transactions.product_id. Produto de parceiro e vendido por
--    partner_product_orders, uma esteira separada que nem tem essa coluna. Ou
--    seja, o vinculo existiria e nunca dispararia.
--
-- Por isso academia_produtos_mensalidade estava vazia nas duas academias: nunca
-- funcionou para produto de parceiro, e nao dava erro -- so silencio.

-- ---------------------------------------------------------------- 1. o vinculo
ALTER TABLE public.academia_produtos_mensalidade
  ADD COLUMN IF NOT EXISTS partner_product_id uuid
    REFERENCES public.partner_products(id) ON DELETE CASCADE;

ALTER TABLE public.academia_produtos_mensalidade ALTER COLUMN product_id DROP NOT NULL;

-- Exatamente uma origem: ou o catalogo da plataforma, ou o produto do parceiro.
-- Sem isto uma linha poderia apontar para os dois e o gerador escolheria sozinho.
ALTER TABLE public.academia_produtos_mensalidade
  DROP CONSTRAINT IF EXISTS academia_produto_mensalidade_uma_origem;
ALTER TABLE public.academia_produtos_mensalidade
  ADD CONSTRAINT academia_produto_mensalidade_uma_origem
  CHECK ((product_id IS NOT NULL) <> (partner_product_id IS NOT NULL));

-- A unicidade antiga e (partner_id, product_id) e continua valendo para o
-- catalogo. Do lado do parceiro precisa de indice proprio, parcial, porque com
-- product_id nulo o unique antigo nao protege nada.
CREATE UNIQUE INDEX IF NOT EXISTS academia_produto_mensalidade_parceiro_unico
  ON public.academia_produtos_mensalidade (partner_id, partner_product_id)
  WHERE partner_product_id IS NOT NULL;

-- ------------------------------------------------------- 2. a mensalidade sabe
-- de que pedido veio. transaction_id nao serve: ele tem FK para `transactions`,
-- e pedido de parceiro nao passa por la. Sem uma chave propria nao ha como
-- impedir que a mesma compra gere mensalidade duas vezes.
ALTER TABLE public.academia_mensalidades
  ADD COLUMN IF NOT EXISTS partner_order_id uuid
    REFERENCES public.partner_product_orders(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS academia_mensalidade_pedido_unico
  ON public.academia_mensalidades (partner_order_id)
  WHERE partner_order_id IS NOT NULL;

-- ---------------------------------------------------------------- 3. o gerador
-- Espelha academia_mensalidade_gerar, que e a versao da transacao. A regua de
-- renovacao, a busca da credencial e o limite semanal do plano sao os mesmos --
-- muda so de onde vem o dinheiro e o produto.
CREATE OR REPLACE FUNCTION public.academia_mensalidade_gerar_pedido(p_order_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o RECORD;
  v_map RECORD;
  v_tz text;
  v_hoje date;
  v_atual date;
  v_novo date;
  v_credencial uuid;
  v_limite integer;
BEGIN
  SELECT id, student_id, partner_product_id, status, gross_amount,
         payment_fee, system_fee, tax_amount, partner_net_amount, payment_method
    INTO o
    FROM public.partner_product_orders
   WHERE id = p_order_id;

  IF o.id IS NULL OR o.status <> 'paid' OR o.partner_product_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT m.partner_id, m.plano, m.dias_validade, m.politica_renovacao
    INTO v_map
    FROM public.academia_produtos_mensalidade m
   WHERE m.partner_product_id = o.partner_product_id AND m.ativo
   LIMIT 1;

  -- Produto que nao libera academia: nao e erro, so nao e assunto nosso.
  IF v_map.partner_id IS NULL THEN
    RETURN false;
  END IF;

  -- Ja gerou mensalidade para este pedido.
  IF EXISTS (SELECT 1 FROM public.academia_mensalidades a WHERE a.partner_order_id = o.id) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = v_map.partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  -- A catraca avalia por CREDENCIAL. Gravar so o student_id deixa a mensalidade
  -- pendurada numa chave que a credencial da pessoa nao conhece: ela paga e
  -- continua bloqueada na porta.
  SELECT c.id INTO v_credencial
    FROM public.academia_credenciais c
   WHERE c.partner_id = v_map.partner_id
     AND c.student_id = o.student_id
     AND c.ativo
   ORDER BY c.created_at
   LIMIT 1;

  -- O limite do plano vira limite DESTA venda. Sem isto, um plano de 3x por
  -- semana comprado na loja daria acesso livre.
  SELECT pl.limite_dias_semana INTO v_limite
    FROM public.academia_plano_do_texto(v_map.partner_id, v_map.plano) pl;

  -- As duas pontas: quem ja tinha mensalidade lancada na recepcao tem
  -- credencial_id, quem comprou pelo app tem student_id.
  SELECT max(a.valido_ate) INTO v_atual
    FROM public.academia_mensalidades a
   WHERE a.partner_id = v_map.partner_id
     AND a.status = 'ativa'
     AND ((v_credencial IS NOT NULL AND a.credencial_id = v_credencial)
       OR (o.student_id IS NOT NULL AND a.student_id = o.student_id));

  v_novo := CASE v_map.politica_renovacao
    WHEN 'justa' THEN
      CASE WHEN v_atual IS NOT NULL AND v_atual >= v_hoje
           THEN v_atual + v_map.dias_validade
           ELSE v_hoje + v_map.dias_validade END
    WHEN 'vencimento' THEN
      COALESCE(v_atual, v_hoje) + v_map.dias_validade
    ELSE
      v_hoje + v_map.dias_validade
  END;

  INSERT INTO public.academia_mensalidades (
    partner_id, student_id, credencial_id, plano, valor, valido_ate, origem,
    forma_pagamento, taxa_percentual, taxa_valor, valor_liquido,
    partner_order_id, observacao, limite_dias_semana
  ) VALUES (
    v_map.partner_id, o.student_id, v_credencial, v_map.plano, o.gross_amount,
    v_novo, 'interna',
    CASE o.payment_method::text
      WHEN 'pix' THEN 'pix'
      WHEN 'credit_card' THEN 'cartao_credito'
      WHEN 'debit_card' THEN 'cartao_debito'
      ELSE 'outro'
    END,
    0,
    COALESCE(o.payment_fee, 0) + COALESCE(o.system_fee, 0) + COALESCE(o.tax_amount, 0),
    COALESCE(o.partner_net_amount, o.gross_amount),
    o.id,
    'Liberado automaticamente pela compra na loja da academia.',
    v_limite
  )
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$function$;

-- ----------------------------------------------------------------- 4. o gancho
-- Gatilho proprio em vez de emendar grant_partner_product_perks: aquela funcao ja
-- faz carteirinha, tickets e pontos, e misturar academia ali faria uma falha de
-- academia derrubar tudo. Aqui a excecao e engolida e anotada no pedido -- pagamento
-- nunca cai por causa disto.
CREATE OR REPLACE FUNCTION public.trg_academia_mensalidade_do_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'paid' AND NEW.partner_product_id IS NOT NULL THEN
    BEGIN
      PERFORM public.academia_mensalidade_gerar_pedido(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Este UPDATE nao re-dispara o gatilho: ele escuta status e paid_at, e
      -- aqui so metadata muda.
      UPDATE public.partner_product_orders
         SET metadata = COALESCE(metadata, '{}'::jsonb)
                        || jsonb_build_object('academia_erro', SQLERRM,
                                              'academia_erro_em', now())
       WHERE id = NEW.id;
    END;
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS trg_academia_mensalidade_do_pedido ON public.partner_product_orders;
CREATE TRIGGER trg_academia_mensalidade_do_pedido
AFTER INSERT OR UPDATE OF status, paid_at ON public.partner_product_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_academia_mensalidade_do_pedido();
