-- Gancho: compra confirmada vira mensalidade de academia.
--
-- Nada de loja, checkout, produto ou pagamento e criado aqui. Tudo isso ja
-- existe e ja roda em producao. Este arquivo so liga uma ponta na outra: quando
-- a transacao daquele produto e confirmada, a mensalidade nasce ou renova.

-- 1. Quais produtos liberam mensalidade, e por quanto tempo ------------------
-- Tudo configuracao da academia, inclusive a politica de renovacao.

CREATE TABLE IF NOT EXISTS public.academia_produtos_mensalidade (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  plano text NOT NULL DEFAULT 'Mensalidade',
  dias_validade integer NOT NULL DEFAULT 30 CHECK (dias_validade > 0),
  -- 'justa'     : tem plano em dia, soma no fim dele; venceu, conta do pagamento
  -- 'vencimento': sempre soma no fim do plano anterior, mesmo vencido
  --               (modelo em que quem paga atrasado perde os dias parados)
  -- 'pagamento' : sempre conta do dia do pagamento
  politica_renovacao text NOT NULL DEFAULT 'justa'
    CHECK (politica_renovacao IN ('justa', 'vencimento', 'pagamento')),
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_produto_mensalidade_unico UNIQUE (partner_id, product_id)
);

ALTER TABLE public.academia_produtos_mensalidade ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_produtos_acesso ON public.academia_produtos_mensalidade;
CREATE POLICY academia_produtos_acesso ON public.academia_produtos_mensalidade
  FOR ALL USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- 2. Idempotencia por transacao ---------------------------------------------
-- Uma transacao paga gera no maximo uma mensalidade, para sempre. Webhook
-- repetido, reprocessamento ou update duplicado nao dobram a validade.

ALTER TABLE public.academia_mensalidades
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS academia_mensalidades_transacao_idx
  ON public.academia_mensalidades (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- 3. O checkout configurado --------------------------------------------------
-- Nao assume Mercado Pago para sempre. Le qual gateway esta configurado e valida
-- por ele; trocar de checkout muda a validacao junto, em vez de quebrar calado.

INSERT INTO public.app_settings (key, value, description)
VALUES ('checkout_ativo', 'mercadopago', 'Gateway que confirma pagamento para liberacao automatica')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.academia_pagamento_confirmado(p_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gateway text;
BEGIN
  SELECT value INTO v_gateway FROM public.app_settings WHERE key = 'checkout_ativo';
  v_gateway := COALESCE(v_gateway, 'mercadopago');

  IF v_gateway = 'mercadopago' THEN
    -- exige o approved do proprio MP, nao so o status local
    RETURN EXISTS (
      SELECT 1 FROM public.mercadopago_payments m
       WHERE m.source_kind = 'transaction'
         AND m.source_id = p_transaction_id
         AND m.status = 'approved'
    );
  END IF;

  -- Gateway desconhecido: nao libera por conta propria. Melhor a academia
  -- lancar a mao do que o sistema liberar sem ter conferido com ninguem.
  RETURN false;
END;
$$;

-- 4. O gancho ----------------------------------------------------------------

-- A regra mora aqui, uma vez so. O gatilho e o reprocessamento chamam esta
-- funcao — duas implementacoes divergiriam, como ja aconteceu com a regua.

CREATE OR REPLACE FUNCTION public.academia_mensalidade_gerar(p_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  v_map RECORD;
  v_tz text;
  v_hoje date;
  v_atual date;
  v_novo date;
BEGIN
  SELECT id, student_id, product_id, status, gross_amount, net_amount,
         app_fee, payment_fee, payment_method
    INTO t
    FROM public.transactions
   WHERE id = p_transaction_id;

  IF t.id IS NULL OR t.status <> 'paid' THEN
    RETURN false;
  END IF;

  SELECT m.partner_id, m.plano, m.dias_validade, m.politica_renovacao
    INTO v_map
    FROM public.academia_produtos_mensalidade m
   WHERE m.product_id = t.product_id AND m.ativo
   LIMIT 1;

  -- Produto que nao libera academia: nao e erro, so nao e assunto nosso.
  IF v_map.partner_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.academia_pagamento_confirmado(t.id) THEN
    RETURN false;
  END IF;

  -- Ja gerou mensalidade para esta transacao.
  IF EXISTS (SELECT 1 FROM public.academia_mensalidades a WHERE a.transaction_id = t.id) THEN
    RETURN false;
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = v_map.partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  SELECT max(a.valido_ate) INTO v_atual
    FROM public.academia_mensalidades a
   WHERE a.partner_id = v_map.partner_id
     AND a.student_id = t.student_id
     AND a.status = 'ativa';

  v_novo := CASE v_map.politica_renovacao
    -- em dia: soma no fim do plano atual. vencido: conta de hoje, para o aluno
    -- nao pagar por dias em que nao pode treinar
    WHEN 'justa' THEN
      CASE WHEN v_atual IS NOT NULL AND v_atual >= v_hoje
           THEN v_atual + v_map.dias_validade
           ELSE v_hoje + v_map.dias_validade END
    -- sempre a partir do vencimento anterior, mesmo vencido
    WHEN 'vencimento' THEN
      COALESCE(v_atual, v_hoje) + v_map.dias_validade
    ELSE
      v_hoje + v_map.dias_validade
  END;

  INSERT INTO public.academia_mensalidades (
    partner_id, student_id, plano, valor, valido_ate, origem, forma_pagamento,
    taxa_percentual, taxa_valor, valor_liquido, transaction_id, observacao
  ) VALUES (
    v_map.partner_id, t.student_id, v_map.plano, t.gross_amount, v_novo, 'interna',
    -- payment_method de transactions e outro enum; guarda o texto equivalente
    CASE t.payment_method::text
      WHEN 'pix' THEN 'pix'
      WHEN 'credit_card' THEN 'cartao_credito'
      WHEN 'debit_card' THEN 'cartao_debito'
      ELSE 'outro'
    END,
    0, COALESCE(t.app_fee, 0) + COALESCE(t.payment_fee, 0),
    COALESCE(t.net_amount, t.gross_amount),
    t.id,
    'Liberado automaticamente pela compra na plataforma.'
  )
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.academia_mensalidade_da_compra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Liberacao nunca pode derrubar a gravacao do pagamento. Se algo aqui falhar,
  -- o dinheiro continua registrado e a rede de seguranca pega depois.
  BEGIN
    PERFORM public.academia_mensalidade_gerar(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'academia_mensalidade_gerar falhou para a transacao %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

-- Dispara na criacao ja paga e na virada para pago. Nao dispara em update que
-- nao mexe no status, para nao reprocessar a cada toque na linha.
DROP TRIGGER IF EXISTS trg_academia_mensalidade_compra_ins ON public.transactions;
CREATE TRIGGER trg_academia_mensalidade_compra_ins
  AFTER INSERT ON public.transactions
  FOR EACH ROW WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION public.academia_mensalidade_da_compra();

DROP TRIGGER IF EXISTS trg_academia_mensalidade_compra_upd ON public.transactions;
CREATE TRIGGER trg_academia_mensalidade_compra_upd
  AFTER UPDATE OF status ON public.transactions
  FOR EACH ROW WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION public.academia_mensalidade_da_compra();

-- 5. Rede de seguranca -------------------------------------------------------
-- Se o webhook do MP chegar depois do status virar 'paid', o gatilho ja passou.
-- Esta funcao reprocessa transacoes pagas e confirmadas que ficaram sem
-- mensalidade. Idempotente pelo indice de transaction_id.

CREATE OR REPLACE FUNCTION public.academia_mensalidades_pendentes_reprocessar(p_partner_id uuid)
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
      JOIN public.academia_produtos_mensalidade m
        ON m.product_id = t.product_id AND m.ativo AND m.partner_id = p_partner_id
     WHERE t.status = 'paid'
       AND NOT EXISTS (SELECT 1 FROM public.academia_mensalidades a WHERE a.transaction_id = t.id)
  LOOP
    -- Chama a mesma funcao do gatilho. Nao adianta reescrever o status para
    -- 'paid': o gatilho de UPDATE so dispara quando o status MUDA, e aqui ele
    -- ja e 'paid'.
    IF public.academia_mensalidade_gerar(r.id) THEN
      v_total := v_total + 1;
    END IF;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_pagamento_confirmado(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_mensalidade_gerar(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_mensalidades_pendentes_reprocessar(uuid) FROM PUBLIC, anon;

-- academia_mensalidade_gerar nao vai para authenticated: ela cria mensalidade
-- sem pedir permissao de academia, porque roda dentro do gatilho. Quem chama de
-- fora e o reprocessamento, que confere academia_pode_ver antes.
GRANT EXECUTE ON FUNCTION public.academia_pagamento_confirmado(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_mensalidade_gerar(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.academia_mensalidades_pendentes_reprocessar(uuid) TO authenticated, service_role;
