-- ============================================================================
-- PASSO 2b — as quatro funcoes de venda passam a ler a taxa vigente
--
-- create_partner_product_order, create_partner_company_order,
-- create_scheduled_professional_order e admin_reprocess_partner_order.
--
-- COMO: substituicao cirurgica dentro do corpo atual de cada funcao, em vez de
-- reescrever 22 KB de codigo financeiro a mao. Cada troca e guardada: se o
-- texto esperado nao for encontrado, a migration ABORTA em vez de aplicar pela
-- metade. Nenhum valor muda — a taxa vigente traz 4,98 / 0,99 / 6 / 5 / 3-2-1.
--
-- O QUE NAO E TOCADO: os overrides manuais por produto continuam com
-- prioridade. A taxa vigente entra exatamente onde antes havia o numero
-- cravado, ou seja, no lugar do padrao — nunca por cima do manual.
-- ============================================================================

DO $mig_taxas$
DECLARE
  r record;
  d text;
  novo text;
  trocas int;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('create_partner_product_order',
                         'create_partner_company_order',
                         'create_scheduled_professional_order',
                         'admin_reprocess_partner_order')
  LOOP
    d := pg_get_functiondef(r.oid);
    novo := d;
    trocas := 0;

    -- maquininha: as tres formas que a mesma expressao aparece
    IF position('CASE _payment_method WHEN ''pix'' THEN 0.99 ELSE 4.98 END' in novo) > 0 THEN
      novo := replace(novo,
        'CASE _payment_method WHEN ''pix'' THEN 0.99 ELSE 4.98 END',
        'CASE _payment_method WHEN ''pix'' THEN (public.taxa_vigente()).maquininha_pix ELSE (public.taxa_vigente()).maquininha_cartao END');
      trocas := trocas + 1;
    END IF;
    IF position('CASE WHEN _payment_method = ''pix'' THEN 0.99 ELSE 4.98 END' in novo) > 0 THEN
      novo := replace(novo,
        'CASE WHEN _payment_method = ''pix'' THEN 0.99 ELSE 4.98 END',
        'CASE WHEN _payment_method = ''pix'' THEN (public.taxa_vigente()).maquininha_pix ELSE (public.taxa_vigente()).maquininha_cartao END');
      trocas := trocas + 1;
    END IF;
    IF position('CASE o.payment_method WHEN ''pix'' THEN 0.99 ELSE 4.98 END' in novo) > 0 THEN
      novo := replace(novo,
        'CASE o.payment_method WHEN ''pix'' THEN 0.99 ELSE 4.98 END',
        'CASE o.payment_method WHEN ''pix'' THEN (public.taxa_vigente()).maquininha_pix ELSE (public.taxa_vigente()).maquininha_cartao END');
      trocas := trocas + 1;
    END IF;

    -- imposto
    IF position('v_tax := ROUND(v_rem * 6 / 100, 2);' in novo) > 0 THEN
      novo := replace(novo,
        'v_tax := ROUND(v_rem * 6 / 100, 2);',
        'v_tax := ROUND(v_rem * (public.taxa_vigente()).imposto_pct / 100, 2);');
      trocas := trocas + 1;
    END IF;
    IF position('COALESCE(v_prod.skip_tax,false) THEN 0 ELSE 6 END;' in novo) > 0 THEN
      novo := replace(novo,
        'COALESCE(v_prod.skip_tax,false) THEN 0 ELSE 6 END;',
        'COALESCE(v_prod.skip_tax,false) THEN 0 ELSE (public.taxa_vigente()).imposto_pct END;');
      trocas := trocas + 1;
    END IF;

    -- taxa do sistema (so o padrao; o override manual continua ganhando)
    IF position('COALESCE(v_prod.system_fee_pct_override, 5)' in novo) > 0 THEN
      novo := replace(novo,
        'COALESCE(v_prod.system_fee_pct_override, 5)',
        'COALESCE(v_prod.system_fee_pct_override, (public.taxa_vigente()).sistema_pct)');
      trocas := trocas + 1;
    END IF;
    IF position('THEN v_prod.system_fee_pct_override ELSE 5 END' in novo) > 0 THEN
      novo := replace(novo,
        'THEN v_prod.system_fee_pct_override ELSE 5 END',
        'THEN v_prod.system_fee_pct_override ELSE (public.taxa_vigente()).sistema_pct END');
      trocas := trocas + 1;
    END IF;
    IF position('v_sys := ROUND(v_rem * 5 / 100, 2);' in novo) > 0 THEN
      novo := replace(novo,
        'v_sys := ROUND(v_rem * 5 / 100, 2);',
        'v_sys := ROUND(v_rem * (public.taxa_vigente()).sistema_pct / 100, 2);');
      trocas := trocas + 1;
    END IF;

    -- rede: os literais diretos
    IF position('v_l1 := ROUND(v_coach_amt * 3 / 100, 2);' in novo) > 0 THEN
      novo := replace(novo, 'v_l1 := ROUND(v_coach_amt * 3 / 100, 2);',
        'v_l1 := ROUND(v_coach_amt * (public.taxa_vigente()).rede_l1_pct / 100, 2);');
      novo := replace(novo, 'v_l2 := ROUND(v_coach_amt * 2 / 100, 2);',
        'v_l2 := ROUND(v_coach_amt * (public.taxa_vigente()).rede_l2_pct / 100, 2);');
      novo := replace(novo, 'v_l3 := ROUND(v_coach_amt * 1 / 100, 2);',
        'v_l3 := ROUND(v_coach_amt * (public.taxa_vigente()).rede_l3_pct / 100, 2);');
      trocas := trocas + 3;
    END IF;

    -- rede: a forma com override por nivel
    IF position('THEN v_prod.network_l1_pct_override ELSE 3 END' in novo) > 0 THEN
      novo := replace(novo, 'THEN v_prod.network_l1_pct_override ELSE 3 END',
        'THEN v_prod.network_l1_pct_override ELSE (public.taxa_vigente()).rede_l1_pct END');
      novo := replace(novo, 'THEN v_prod.network_l2_pct_override ELSE 2 END',
        'THEN v_prod.network_l2_pct_override ELSE (public.taxa_vigente()).rede_l2_pct END');
      novo := replace(novo, 'THEN v_prod.network_l3_pct_override ELSE 1 END',
        'THEN v_prod.network_l3_pct_override ELSE (public.taxa_vigente()).rede_l3_pct END');
      trocas := trocas + 3;
    END IF;

    IF trocas < 6 THEN
      RAISE EXCEPTION 'Abortado: em % so encontrei % troca(s), esperava ao menos 6. Nada foi aplicado.', r.proname, trocas;
    END IF;
    IF novo = d THEN
      RAISE EXCEPTION 'Abortado: o corpo de % nao mudou.', r.proname;
    END IF;

    EXECUTE novo;
    RAISE NOTICE '% -> % trocas', r.proname, trocas;
  END LOOP;
END
$mig_taxas$;
