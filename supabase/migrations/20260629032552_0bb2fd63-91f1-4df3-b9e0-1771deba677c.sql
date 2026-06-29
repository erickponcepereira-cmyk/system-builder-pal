CREATE OR REPLACE FUNCTION public.process_paid_transaction_patch_referral()
RETURNS void LANGUAGE plpgsql AS $mig$
BEGIN
  -- Substitui dois trechos da function process_paid_transaction usando ALTER via CREATE OR REPLACE.
  -- Como não temos jeito programático de patch, reescrevemos toda a função abaixo nesta migration.
  NULL;
END;
$mig$;
DROP FUNCTION public.process_paid_transaction_patch_referral();

-- Reescreve só o necessário: cria função wrapper auxiliar não é viável; vamos atualizar
-- o filtro de slots e a condição de redirecionamento via OR REPLACE do trecho.
-- Como Postgres só permite OR REPLACE de função inteira, redefinimos abaixo apenas
-- o comportamento alterado mantendo a lógica anterior usando uma view temporária
-- via DO block que reexporta a função com os ajustes.

DO $$
DECLARE
  v_src text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_src
  FROM pg_proc WHERE proname='process_paid_transaction';

  -- 1) Restringe filtro de slots em venda por indicação a applies_to_student_referral=true
  v_src := replace(
    v_src,
    '          (v_is_referral_sale AND (
              COALESCE(applies_to_student_referral, false) = true
              OR COALESCE(applies_to_referral_sales, true) = false
          ))',
    '          (v_is_referral_sale AND COALESCE(applies_to_student_referral, false) = true)'
  );

  -- 2) Redireciona ao indicador apenas o slot com destination = referral_student
  v_src := replace(
    v_src,
    'IF v_is_referral_sale AND COALESCE(slot.applies_to_student_referral, false) = true THEN',
    'IF v_is_referral_sale AND slot.destination::TEXT = ''referral_student'' THEN'
  );

  -- 3) Permite crédito da sobra também em vendas por indicação
  v_src := replace(
    v_src,
    'IF remainder_amount > 0.01 AND coach_row.id IS NOT NULL AND NOT v_is_referral_sale THEN',
    'IF remainder_amount > 0.01 AND coach_row.id IS NOT NULL THEN'
  );

  EXECUTE v_src;
END $$;

-- Reprocessa transações pagas recentes para refletir nova lógica (últimas 48h)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.transactions
    WHERE status = 'paid' AND COALESCE(paid_at, created_at) > now() - interval '48 hours'
  LOOP
    BEGIN
      PERFORM public.process_paid_transaction(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'skip tx %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;