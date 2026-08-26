-- ============================================================================
-- PASSO 2c — a loja passa a ler a taxa vigente
--
-- mark_store_order_paid_and_process ja lia configuracao, mas de OUTRA fonte:
-- payment_fee_configs para a maquininha e app_settings.product_default_tax
-- para o imposto. Isso significa que amanha, ao mudar a taxa em taxas_vigentes,
-- a loja continuaria na antiga — o pior dos mundos, porque nada quebraria e a
-- divergencia so apareceria no extrato de alguem.
--
-- Nenhum valor muda: payment_fee_configs traz 4,98/0,99 e app_settings traz 6,
-- que e exatamente o que a taxa vigente devolve.
--
-- Os COALESCE de reserva (0.99 / 4.98 / 6) ficam como rede de seguranca, para
-- a venda nao quebrar se a tabela de vigencia ficar sem linha valida.
-- ============================================================================

DO $mig_loja$
DECLARE
  d text;
  novo text;
  trocas int := 0;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'mark_store_order_paid_and_process';

  IF d IS NULL THEN
    RAISE EXCEPTION 'Abortado: mark_store_order_paid_and_process nao encontrada.';
  END IF;
  novo := d;

  -- maquininha: sai payment_fee_configs, entra taxa_vigente
  IF position('FROM public.payment_fee_configs' in novo) > 0 THEN
    novo := replace(novo,
      E'      FROM public.payment_fee_configs\n     WHERE is_default = true AND is_active = true\n     ORDER BY created_at DESC\n     LIMIT 1;',
      E'      FROM public.taxa_vigente() t;');
    novo := replace(novo,
      'SELECT pix_fee_percentage, card_fee_percentage',
      'SELECT t.maquininha_pix, t.maquininha_cartao');
    trocas := trocas + 1;
  END IF;

  -- imposto: sai app_settings, entra taxa_vigente
  IF position('WHERE key = ''product_default_tax''' in novo) > 0 THEN
    novo := replace(novo,
      E'    SELECT COALESCE(NULLIF(value, \'\')::numeric, 6)\n      INTO v_tax_pct\n      FROM public.app_settings\n     WHERE key = \'product_default_tax\'\n     LIMIT 1;',
      E'    SELECT COALESCE(t.imposto_pct, 6)\n      INTO v_tax_pct\n      FROM public.taxa_vigente() t;');
    trocas := trocas + 1;
  END IF;

  IF trocas < 2 THEN
    RAISE EXCEPTION 'Abortado: encontrei % troca(s) de 2 esperadas. Nada foi aplicado.', trocas;
  END IF;
  IF position('payment_fee_configs' in novo) > 0 OR position('product_default_tax' in novo) > 0 THEN
    RAISE EXCEPTION 'Abortado: sobrou referencia a fonte antiga no corpo novo.';
  END IF;

  EXECUTE novo;
  RAISE NOTICE 'mark_store_order_paid_and_process -> % trocas', trocas;
END
$mig_loja$;
