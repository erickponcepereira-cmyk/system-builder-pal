-- Planos da academia, pagamento dividido, e renovação em uma chamada.
--
-- Três buracos que apareceram juntos ao colocar a Estação em produção:
--
-- 1. Não havia catálogo de plano. Cada lançamento digitava plano e valor na
--    mão, então "Mensal" e "mensal" viravam coisas diferentes e ninguém sabia
--    qual é o preço de tabela.
--
-- 2. Só cabia UMA forma de pagamento por lançamento. Metade no pix e metade no
--    cartão — que é o que acontece no balcão — não tinha como registrar, e a
--    taxa saía errada porque cada forma tem a sua.
--
-- 3. registrar_mensalidade exigia student_id. Depois que aluno de academia
--    deixou de precisar ser usuário do app, isso significa que 400 das 401
--    pessoas NÃO PODIAM SER RENOVADAS pela tela. A renovação, que é a operação
--    mais comum de uma academia, era a única impossível.

-- ---------------------------------------------------------------- planos

CREATE TABLE IF NOT EXISTS public.academia_planos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   uuid NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  nome         text NOT NULL,
  valor_padrao numeric(10,2) NOT NULL DEFAULT 0,
  dias         integer NOT NULL DEFAULT 30,
  posicao      integer NOT NULL DEFAULT 0,
  ativo        boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_plano_nome_unico UNIQUE (partner_id, nome),
  CONSTRAINT academia_plano_dias_positivo CHECK (dias > 0)
);

ALTER TABLE public.academia_planos ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.academia_planos.valor_padrao IS
  'Preço de tabela. É sugestão: a recepção pode mudar o valor na hora da venda, e o que vale é o que foi cobrado.';

-- ------------------------------------------------- pagamento dividido

CREATE TABLE IF NOT EXISTS public.academia_mensalidade_pagamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mensalidade_id  uuid NOT NULL REFERENCES public.academia_mensalidades(id) ON DELETE CASCADE,
  forma_pagamento text NOT NULL,
  valor           numeric(10,2) NOT NULL,
  taxa_percentual numeric(6,4) NOT NULL DEFAULT 0,
  taxa_valor      numeric(10,2) NOT NULL DEFAULT 0,
  valor_liquido   numeric(10,2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academia_pagamento_valor_positivo CHECK (valor > 0)
);

CREATE INDEX IF NOT EXISTS academia_pagamentos_por_mensalidade
  ON public.academia_mensalidade_pagamentos (mensalidade_id);

ALTER TABLE public.academia_mensalidade_pagamentos ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.academia_mensalidade_pagamentos IS
  'Uma linha por forma de pagamento usada no lançamento. A taxa é calculada por linha, porque pix e cartão têm taxas diferentes — somar tudo e aplicar uma taxa só dá número errado.';

-- --------------------------------------------------------- renovação

/**
 * Lança ou renova uma mensalidade, com pagamento dividido.
 *
 * Aceita credencial OU aluno, porque as duas pontas existem. A data nova é
 * calculada a partir do vencimento atual quando ele ainda está no futuro —
 * quem renova antes do fim não perde os dias que pagou. Só cai para "a partir
 * de hoje" quando o plano já venceu.
 */
CREATE OR REPLACE FUNCTION public.academia_renovar(
  p_partner_id    uuid,
  p_credencial_id uuid,
  p_student_id    uuid,
  p_plano         text,
  p_valor         numeric,
  p_pagamentos    jsonb,
  p_dias          integer,
  p_registrado_por uuid DEFAULT NULL,
  p_observacao    text DEFAULT NULL
)
RETURNS TABLE(mensalidade_id uuid, valido_ate date, bruto numeric, taxas numeric, liquido numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_atual   date;
  v_base    date;
  v_novo    date;
  v_id      uuid;
  v_tz      text;
  v_hoje    date;
  pg        jsonb;
  v_pct     numeric;
  v_fixa    numeric;
  v_tx      numeric;
  v_soma    numeric := 0;
  v_taxas   numeric := 0;
BEGIN
  IF p_credencial_id IS NULL AND p_student_id IS NULL THEN
    RAISE EXCEPTION 'Informe a credencial ou o aluno.';
  END IF;
  IF p_dias IS NULL OR p_dias <= 0 THEN
    RAISE EXCEPTION 'O plano precisa de uma duração em dias.';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_hoje := (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date;

  -- Vencimento mais longo que a pessoa já tem hoje.
  SELECT max(m.valido_ate) INTO v_atual
    FROM public.academia_mensalidades m
   WHERE m.partner_id = p_partner_id
     AND m.status = 'ativa'
     AND ((p_credencial_id IS NOT NULL AND m.credencial_id = p_credencial_id)
       OR (p_student_id    IS NOT NULL AND m.student_id    = p_student_id));

  -- Renovar antes de vencer soma em cima do que resta; renovar depois começa
  -- hoje. Sem isso, quem paga adiantado perderia os dias já comprados.
  v_base := GREATEST(COALESCE(v_atual, v_hoje), v_hoje);
  v_novo := v_base + p_dias;

  INSERT INTO public.academia_mensalidades
    (partner_id, student_id, credencial_id, plano, valor, valido_ate,
     origem, forma_pagamento, status, registrado_por, observacao)
  VALUES (p_partner_id, p_student_id, p_credencial_id, p_plano, COALESCE(p_valor,0), v_novo,
          'externa',
          -- A forma "de capa" é a de maior valor; o detalhe fica nos pagamentos.
          COALESCE((SELECT x->>'forma' FROM jsonb_array_elements(p_pagamentos) x
                     ORDER BY (x->>'valor')::numeric DESC LIMIT 1), 'outro'),
          'ativa', p_registrado_por, p_observacao)
  RETURNING id INTO v_id;

  -- Uma linha por forma, com a taxa daquela forma. Somar tudo e aplicar uma
  -- taxa só daria número errado sempre que a venda for dividida.
  FOR pg IN SELECT * FROM jsonb_array_elements(COALESCE(p_pagamentos, '[]'::jsonb))
  LOOP
    SELECT COALESCE(t.taxa_percentual,0), COALESCE(t.taxa_fixa,0) INTO v_pct, v_fixa
      FROM public.partner_taxas_externas t
     WHERE t.partner_id = p_partner_id AND t.forma_pagamento = (pg->>'forma');
    v_pct  := COALESCE(v_pct, 0);
    v_fixa := COALESCE(v_fixa, 0);
    -- Dinheiro nunca tem taxa, mesmo que alguém configure uma por engano.
    IF (pg->>'forma') = 'dinheiro' THEN v_pct := 0; v_fixa := 0; END IF;

    v_tx := round(((pg->>'valor')::numeric * v_pct / 100) + v_fixa, 2);

    INSERT INTO public.academia_mensalidade_pagamentos
      (mensalidade_id, forma_pagamento, valor, taxa_percentual, taxa_valor, valor_liquido)
    VALUES (v_id, pg->>'forma', (pg->>'valor')::numeric, v_pct, v_tx,
            round((pg->>'valor')::numeric - v_tx, 2));

    v_soma  := v_soma  + (pg->>'valor')::numeric;
    v_taxas := v_taxas + v_tx;
  END LOOP;

  -- Os totais do lançamento passam a ser a soma das partes.
  UPDATE public.academia_mensalidades
     SET valor           = CASE WHEN v_soma > 0 THEN v_soma ELSE COALESCE(p_valor,0) END,
         taxa_valor      = v_taxas,
         taxa_percentual = CASE WHEN v_soma > 0 THEN round(v_taxas * 100 / v_soma, 4) ELSE 0 END,
         valor_liquido   = CASE WHEN v_soma > 0 THEN v_soma - v_taxas ELSE COALESCE(p_valor,0) END
   WHERE id = v_id;

  mensalidade_id := v_id;
  valido_ate     := v_novo;
  bruto          := CASE WHEN v_soma > 0 THEN v_soma ELSE COALESCE(p_valor,0) END;
  taxas          := v_taxas;
  liquido        := bruto - v_taxas;
  RETURN NEXT;
END;
$function$;

-- ------------------------------------------------- planos da Estação

INSERT INTO public.academia_planos (partner_id, nome, valor_padrao, dias, posicao)
VALUES
  ('094db4de-025b-4bed-bf82-31df76a6dc1e', 'Mensal - Livre',           145.00, 30, 1),
  ('094db4de-025b-4bed-bf82-31df76a6dc1e', 'Mensal - 3x semana',       120.00, 30, 2),
  ('094db4de-025b-4bed-bf82-31df76a6dc1e', 'Trimestral - Livre',       390.00, 90, 3),
  ('094db4de-025b-4bed-bf82-31df76a6dc1e', 'Trimestral - 3x semana',   330.00, 90, 4)
ON CONFLICT (partner_id, nome) DO UPDATE
  SET valor_padrao = EXCLUDED.valor_padrao,
      dias         = EXCLUDED.dias,
      posicao      = EXCLUDED.posicao,
      ativo        = true,
      updated_at   = now();
