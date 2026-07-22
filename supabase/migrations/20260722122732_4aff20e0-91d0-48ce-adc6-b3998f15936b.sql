
-- Reconciliar todas as carteiras (rodar recalc para cada beneficiary_profile_id em commissions)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT beneficiary_profile_id AS pid
    FROM public.commissions
    WHERE beneficiary_profile_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.recalc_wallet_for_profile(r.pid);
    EXCEPTION WHEN OTHERS THEN
      -- não interromper o batch em caso de erro individual
      RAISE NOTICE 'recalc falhou para %: %', r.pid, SQLERRM;
    END;
  END LOOP;
END $$;

-- Helper RPC para reconciliação sob demanda pelo admin (retorna quantos foram processados)
CREATE OR REPLACE FUNCTION public.admin_reconcile_all_wallets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; v_count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  FOR r IN
    SELECT DISTINCT beneficiary_profile_id AS pid
    FROM public.commissions
    WHERE beneficiary_profile_id IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.recalc_wallet_for_profile(r.pid);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_reconcile_all_wallets() TO authenticated;
