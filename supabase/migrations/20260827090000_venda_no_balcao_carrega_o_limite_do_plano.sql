-- A venda no balcão passa a carregar o limite semanal do plano.
--
-- `academia_renovar` recebe o NOME do plano e montava a mensalidade sem o
-- `limite_dias_semana`. Resultado: um plano de 3x vendido na recepção nascia
-- sem limite nenhum, e a regra que acabou de entrar não valia para nenhuma
-- venda nova — só para as importadas do Next Fit, que foram preenchidas no
-- backfill.
--
-- O limite é copiado, não referenciado: é na mensalidade que a régua de acesso
-- olha. Editar o plano depois muda o que se vende daqui pra frente e não mexe
-- em contrato já assinado.
CREATE OR REPLACE FUNCTION public.academia_renovar(
  p_partner_id uuid, p_credencial_id uuid, p_student_id uuid, p_plano text,
  p_valor numeric, p_pagamentos jsonb, p_dias integer,
  p_registrado_por uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text,
  p_valido_ate date DEFAULT NULL::date
)
RETURNS TABLE(mensalidade_id uuid, valido_ate date, bruto numeric, taxas numeric, liquido numeric)
LANGUAGE plpgsql
VOLATILE
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
  v_limite  integer;
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
  IF p_valido_ate IS NULL AND (p_dias IS NULL OR p_dias <= 0) THEN
    RAISE EXCEPTION 'O plano precisa de uma duração em dias.';
  END IF;

  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_hoje := (now() AT TIME ZONE COALESCE(v_tz, 'America/Sao_Paulo'))::date;

  -- O limite do plano vira limite DESTA venda. Plano avulso, digitado a mao e
  -- que nao existe no cadastro, fica sem limite -- que e o certo: ninguem
  -- combinou numero de dias.
  SELECT pl.limite_dias_semana INTO v_limite
    FROM public.academia_planos pl
   WHERE pl.partner_id = p_partner_id AND pl.nome = p_plano
   LIMIT 1;

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

  IF p_valido_ate IS NOT NULL THEN
    -- A recepção pode ajustar a data na mão (cortesia, acerto de dias). Só não
    -- pode lançar uma mensalidade que já nasce vencida.
    IF p_valido_ate < v_hoje THEN
      RAISE EXCEPTION 'A validade não pode ser anterior a hoje.';
    END IF;
    v_novo := p_valido_ate;
  ELSE
    v_novo := v_base + p_dias;
  END IF;

  INSERT INTO public.academia_mensalidades
    (partner_id, student_id, credencial_id, plano, valor, valido_ate,
     origem, forma_pagamento, status, registrado_por, observacao, limite_dias_semana)
  VALUES (p_partner_id, p_student_id, p_credencial_id, p_plano, COALESCE(p_valor,0), v_novo,
          'externa',
          COALESCE((SELECT x->>'forma' FROM jsonb_array_elements(p_pagamentos) x
                     ORDER BY (x->>'valor')::numeric DESC LIMIT 1), 'outro'),
          'ativa', p_registrado_por, p_observacao, v_limite)
  RETURNING id INTO v_id;

  FOR pg IN SELECT * FROM jsonb_array_elements(COALESCE(p_pagamentos, '[]'::jsonb))
  LOOP
    SELECT COALESCE(t.taxa_percentual,0), COALESCE(t.taxa_fixa,0) INTO v_pct, v_fixa
      FROM public.partner_taxas_externas t
     WHERE t.partner_id = p_partner_id AND t.forma_pagamento = (pg->>'forma');
    v_pct  := COALESCE(v_pct, 0);
    v_fixa := COALESCE(v_fixa, 0);
    IF (pg->>'forma') = 'dinheiro' THEN v_pct := 0; v_fixa := 0; END IF;

    v_tx := round(((pg->>'valor')::numeric * v_pct / 100) + v_fixa, 2);

    INSERT INTO public.academia_mensalidade_pagamentos
      (mensalidade_id, forma_pagamento, valor, taxa_percentual, taxa_valor, valor_liquido)
    VALUES (v_id, pg->>'forma', (pg->>'valor')::numeric, v_pct, v_tx,
            round((pg->>'valor')::numeric - v_tx, 2));

    v_soma  := v_soma  + (pg->>'valor')::numeric;
    v_taxas := v_taxas + v_tx;
  END LOOP;

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
