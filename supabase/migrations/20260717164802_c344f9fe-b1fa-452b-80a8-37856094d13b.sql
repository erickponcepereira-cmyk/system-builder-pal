-- Reconciliar todas as carteiras chamando o recalc para cada profile com carteira principal, parceiro ou profissional.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT profile_id AS pid FROM public.wallets
    UNION
    SELECT p.profile_id FROM public.partners p JOIN public.partner_wallets pw ON pw.partner_id = p.id
    UNION
    SELECT c.profile_id FROM public.coaches c JOIN public.professional_wallets prw ON prw.professional_coach_id = c.id
  LOOP
    BEGIN
      PERFORM public.recalc_wallets_for_owner(r.pid);
    EXCEPTION WHEN OTHERS THEN
      -- não interrompe a reconciliação global
      NULL;
    END;
  END LOOP;
END$$;
