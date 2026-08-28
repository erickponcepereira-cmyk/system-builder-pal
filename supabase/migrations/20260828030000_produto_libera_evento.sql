-- Gancho: compra confirmada vira inscricao em evento da academia.
--
-- Mesmo desenho da mensalidade (20260813090000_academia_produto_mensalidade),
-- outro destino: em vez de somar dias de plano, a compra emite a credencial de
-- entrada de um evento avulso. Nada de loja, checkout, produto ou evento e
-- criado aqui — tudo isso ja existe e ja roda. Este arquivo so liga uma ponta
-- na outra.

-- 1. Qual produto libera qual evento -----------------------------------------

CREATE TABLE IF NOT EXISTS public.academia_produtos_evento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  -- UNIQUE sozinho, ao contrario da mensalidade, que e unica por (parceiro,
  -- produto): uma compra so pode virar UMA inscricao, entao o produto so pode
  -- apontar para um evento — e de uma academia so.
  product_id uuid NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  evento_id uuid NOT NULL REFERENCES public.academia_eventos(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academia_produtos_evento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academia_produtos_evento_acesso ON public.academia_produtos_evento;
CREATE POLICY academia_produtos_evento_acesso ON public.academia_produtos_evento
  FOR ALL
  TO authenticated
  USING (public.academia_pode_ver(partner_id))
  WITH CHECK (public.academia_pode_ver(partner_id));

-- 2. Idempotencia por transacao ----------------------------------------------
-- Uma transacao paga gera no maximo uma inscricao, para sempre. Webhook
-- repetido ou update duplicado nao emitem uma segunda credencial.

ALTER TABLE public.academia_evento_inscricoes
  ADD COLUMN IF NOT EXISTS transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS academia_evento_inscricoes_transacao_idx
  ON public.academia_evento_inscricoes (transaction_id)
  WHERE transaction_id IS NOT NULL;

-- 3. O gancho ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.academia_evento_inscricao_gerar(p_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  v_map RECORD;
  v_nome text;
BEGIN
  SELECT id, student_id, product_id, status, gross_amount, net_amount,
         app_fee, payment_fee, payment_method
    INTO t
    FROM public.transactions
   WHERE id = p_transaction_id;

  IF t.id IS NULL OR t.status <> 'paid' THEN
    RETURN false;
  END IF;

  -- O partner_id vem do evento, nao do mapeamento: e com ele que a inscricao
  -- precisa casar. E evento desligado nao emite credencial nova.
  SELECT m.evento_id, e.partner_id
    INTO v_map
    FROM public.academia_produtos_evento m
    JOIN public.academia_eventos e ON e.id = m.evento_id AND e.ativo
   WHERE m.product_id = t.product_id AND m.ativo
   LIMIT 1;

  -- Produto que nao libera evento: nao e erro, so nao e assunto nosso.
  IF v_map.evento_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT public.academia_pagamento_confirmado(t.id) THEN
    RETURN false;
  END IF;

  IF EXISTS (SELECT 1 FROM public.academia_evento_inscricoes i WHERE i.transaction_id = t.id) THEN
    RETURN false;
  END IF;

  SELECT p.name INTO v_nome
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
   WHERE s.id = t.student_id;

  -- cpf_hash, cpf_final e telefone ficam nulos de proposito: a compra na loja
  -- nao pede esses dados, e quem comprou ja esta identificado por student_id.
  INSERT INTO public.academia_evento_inscricoes (
    evento_id, partner_id, student_id, nome, valor, forma_pagamento,
    taxa_percentual, taxa_valor, valor_liquido, transaction_id
  ) VALUES (
    v_map.evento_id, v_map.partner_id, t.student_id,
    COALESCE(NULLIF(trim(v_nome), ''), 'Participante'),
    t.gross_amount,
    -- payment_method de transactions e outro enum; guarda o texto equivalente
    CASE t.payment_method::text
      WHEN 'pix' THEN 'pix'
      WHEN 'credit_card' THEN 'cartao_credito'
      WHEN 'debit_card' THEN 'cartao_debito'
      ELSE 'outro'
    END,
    0, COALESCE(t.app_fee, 0) + COALESCE(t.payment_fee, 0),
    COALESCE(t.net_amount, t.gross_amount),
    t.id
  )
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

-- 4. O gatilho que ja existia, agora com dois destinos ------------------------
-- Mesmo nome e mesmos triggers de 20260813090000; so o corpo muda.

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

  -- Bloco proprio, e nao continuacao do de cima: um produto de evento nao pode
  -- ficar sem inscricao porque a mensalidade quebrou, nem o contrario.
  BEGIN
    PERFORM public.academia_evento_inscricao_gerar(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'academia_evento_inscricao_gerar falhou para a transacao %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_evento_inscricao_gerar(uuid) FROM PUBLIC, anon;

-- Nao vai para authenticated, igual a de mensalidade: ela cria inscricao sem
-- pedir permissao de academia, porque roda dentro do gatilho.
GRANT EXECUTE ON FUNCTION public.academia_evento_inscricao_gerar(uuid) TO service_role;
