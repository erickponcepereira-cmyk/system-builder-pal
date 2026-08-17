ALTER TABLE public.partner_products ADD COLUMN IF NOT EXISTS system_fee_amount_override numeric;
ALTER TABLE public.professional_products ADD COLUMN IF NOT EXISTS system_fee_amount_override numeric;

DO $mig$
DECLARE
  r record;
  def text;
  newdef text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('create_partner_company_order','create_partner_product_order','create_scheduled_professional_order')
  LOOP
    def := pg_get_functiondef(r.oid);
    newdef := def;

    newdef := replace(newdef,
      'v_sys := ROUND(v_rem * COALESCE(v_prod.system_fee_pct_override, 5) / 100, 2);',
      'v_sys := CASE WHEN v_prod.system_fee_amount_override IS NOT NULL THEN LEAST(GREATEST(v_prod.system_fee_amount_override, 0), v_rem) ELSE ROUND(v_rem * COALESCE(v_prod.system_fee_pct_override, 5) / 100, 2) END;');

    newdef := replace(newdef,
      'v_sys := ROUND(v_rem * v_sys_pct / 100, 2);',
      'v_sys := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.system_fee_amount_override IS NOT NULL THEN LEAST(GREATEST(v_prod.system_fee_amount_override, 0), v_rem) ELSE ROUND(v_rem * v_sys_pct / 100, 2) END;');

    newdef := replace(newdef,
      'v_sys := ROUND(v_rem * CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.system_fee_pct_override IS NOT NULL THEN v_prod.system_fee_pct_override ELSE 5 END / 100, 2);',
      'v_sys := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.system_fee_amount_override IS NOT NULL THEN LEAST(GREATEST(v_prod.system_fee_amount_override, 0), v_rem) ELSE ROUND(v_rem * CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.system_fee_pct_override IS NOT NULL THEN v_prod.system_fee_pct_override ELSE 5 END / 100, 2) END;');

    IF newdef = def THEN
      RAISE EXCEPTION 'Nao foi possivel aplicar a taxa fixa na funcao %', r.proname;
    END IF;

    EXECUTE newdef;
  END LOOP;
END
$mig$;