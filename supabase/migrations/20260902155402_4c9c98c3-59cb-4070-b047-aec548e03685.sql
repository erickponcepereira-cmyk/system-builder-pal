REVOKE ALL ON FUNCTION public.recalc_wallet_for_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.recalc_wallets_for_owner(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_financial_owner_wallet() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_coproduction_wallets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_wallet_for_profile(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalc_wallets_for_owner(uuid) TO service_role;

DROP TRIGGER IF EXISTS trg_financial_commission_recalc ON public.commissions;
DROP TRIGGER IF EXISTS trg_financial_order_recalc ON public.partner_product_orders;
DROP FUNCTION IF EXISTS public.sync_financial_owner_wallet();

CREATE OR REPLACE FUNCTION public.recalc_wallets_for_owner(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE
  v_statement jsonb;
  v_total_available numeric := 0;
  v_gross_available numeric := 0;
  v_ratio numeric := 0;
  r record;
BEGIN
  IF _profile_id IS NULL OR current_setting('fitmind.deleting_profile_id',true)=_profile_id::text THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_profile_id) THEN RETURN; END IF;

  v_statement := public.wallet_statement(_profile_id,false);
  v_total_available := COALESCE((v_statement->>'available')::numeric,0);
  SELECT COALESCE(SUM(amount),0) INTO v_gross_available
  FROM public.financial_ledger_events(_profile_id)
  WHERE source_kind<>'fitcoin' AND state='available';
  v_ratio := CASE WHEN v_gross_available>0 THEN LEAST(1,v_total_available/v_gross_available) ELSE 0 END;

  INSERT INTO public.wallets(profile_id,available_balance,pending_balance,total_earned,total_withdrawn,updated_at)
  SELECT _profile_id,
    round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='available'),0)*v_ratio,0),2),
    round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state IN ('hold','network_blocked')),0),0),2),
    round(COALESCE(SUM(amount),0),2),
    round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='available'),0)*(1-v_ratio),0),2),now()
  FROM public.financial_ledger_events(_profile_id)
  WHERE source_kind='coach' AND source_type='commission'
  ON CONFLICT(profile_id) DO UPDATE SET available_balance=EXCLUDED.available_balance,pending_balance=EXCLUDED.pending_balance,
    total_earned=EXCLUDED.total_earned,total_withdrawn=EXCLUDED.total_withdrawn,updated_at=now();

  FOR r IN SELECT id FROM public.partners WHERE profile_id=_profile_id LOOP
    INSERT INTO public.partner_wallets(partner_id,available_balance,pending_balance,total_earned,total_withdrawn,updated_at)
    SELECT r.id,
      round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='available'),0)*v_ratio,0),2),
      round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='hold'),0),0),2),
      round(COALESCE(SUM(amount),0),2),
      round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='available'),0)*(1-v_ratio),0),2),now()
    FROM public.financial_ledger_events(_profile_id)
    WHERE source_kind='partner' AND wallet_owner_id=r.id
    ON CONFLICT(partner_id) DO UPDATE SET available_balance=EXCLUDED.available_balance,pending_balance=EXCLUDED.pending_balance,
      total_earned=EXCLUDED.total_earned,total_withdrawn=EXCLUDED.total_withdrawn,updated_at=now();
  END LOOP;

  FOR r IN SELECT id FROM public.coaches WHERE profile_id=_profile_id LOOP
    INSERT INTO public.professional_wallets(professional_coach_id,available_balance,pending_balance,total_earned,total_withdrawn,updated_at)
    SELECT r.id,
      round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='available'),0)*v_ratio,0),2),
      round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='hold'),0),0),2),
      round(COALESCE(SUM(amount),0),2),
      round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='available'),0)*(1-v_ratio),0),2),now()
    FROM public.financial_ledger_events(_profile_id)
    WHERE source_kind='professional' AND wallet_owner_id=r.id
    ON CONFLICT(professional_coach_id) DO UPDATE SET available_balance=EXCLUDED.available_balance,pending_balance=EXCLUDED.pending_balance,
      total_earned=EXCLUDED.total_earned,total_withdrawn=EXCLUDED.total_withdrawn,updated_at=now();
  END LOOP;
END;
$function$;
REVOKE ALL ON FUNCTION public.recalc_wallets_for_owner(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_wallets_for_owner(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.recalc_wallet_for_profile(_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$ BEGIN PERFORM public.recalc_wallets_for_owner(_profile_id); END; $function$;
REVOKE ALL ON FUNCTION public.recalc_wallet_for_profile(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_wallet_for_profile(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.sync_coproduction_wallets() FROM PUBLIC,anon,authenticated;