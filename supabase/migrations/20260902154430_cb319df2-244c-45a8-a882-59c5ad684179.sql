CREATE OR REPLACE FUNCTION public.financial_ledger_events(_profile_id uuid DEFAULT NULL)
RETURNS TABLE (
  beneficiary_profile_id uuid,
  ledger_key text,
  source_type text,
  source_kind text,
  wallet_owner_id uuid,
  reference_id uuid,
  amount numeric,
  state text,
  available_at timestamptz,
  occurred_at timestamptz,
  description text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
WITH commission_ranked AS (
  SELECT c.*,
         row_number() OVER (
           PARTITION BY
             COALESCE('tx:' || c.transaction_id::text, 'po:' || c.partner_order_id::text, 'row:' || c.id::text),
             c.beneficiary_profile_id,
             COALESCE(c.beneficiary_coach_id::text, ''),
             COALESCE(c.level, 0),
             lower(trim(COALESCE(c.slot_label, ''))),
             c.status::text,
             COALESCE(c.is_referral, false)
           ORDER BY c.created_at DESC, c.id DESC
         ) AS financial_rank
  FROM public.commissions c
  WHERE (_profile_id IS NULL OR c.beneficiary_profile_id = _profile_id)
    AND COALESCE(c.is_test, false) = false
    AND COALESCE(c.slot_label, '') !~* '^(sistema|admin|nutri)'
    AND c.status::text IN ('pending', 'available', 'withdrawn')
), commission_rows AS (
  SELECT
    c.beneficiary_profile_id,
    'commission:' || c.id::text,
    CASE WHEN COALESCE(c.is_referral, false) THEN 'referral' ELSE 'commission' END,
    CASE WHEN COALESCE(c.is_referral, false) THEN 'fitcoin' ELSE 'coach' END,
    c.beneficiary_coach_id,
    COALESCE(c.transaction_id, c.partner_order_id, c.id),
    c.amount::numeric,
    CASE
      WHEN COALESCE(c.is_referral, false) THEN
        CASE WHEN c.status::text IN ('available', 'withdrawn') OR COALESCE(c.available_at, c.created_at) <= now() THEN 'available' ELSE 'hold' END
      WHEN COALESCE(c.force_released, false) THEN 'available'
      WHEN NOT (c.status::text IN ('available', 'withdrawn') OR (c.available_at IS NOT NULL AND c.available_at <= now())) THEN 'hold'
      WHEN COALESCE(c.is_network, false) AND NOT COALESCE((
        SELECT nuh.any_completed
        FROM public.network_unlock_history nuh
        WHERE nuh.profile_id = c.beneficiary_profile_id
          AND nuh.period_year = EXTRACT(YEAR FROM (c.created_at AT TIME ZONE 'UTC'))::int
          AND nuh.period_month = EXTRACT(MONTH FROM (c.created_at AT TIME ZONE 'UTC'))::int
      ), false) THEN 'network_blocked'
      ELSE 'available'
    END,
    c.available_at,
    c.created_at,
    COALESCE(c.slot_label, 'Comissão')
  FROM commission_ranked c
  WHERE c.financial_rank = 1
), paid_orders AS (
  SELECT o.*,
         COALESCE(
           o.available_at,
           CASE WHEN COALESCE(o.released_early, false) THEN COALESCE(o.released_early_at, now())
                ELSE COALESCE(o.paid_at, o.created_at) + make_interval(days => COALESCE(o.release_days, 7)) END
         ) AS financial_available_at
  FROM public.partner_product_orders o
  WHERE o.status = 'paid' AND COALESCE(o.is_test, false) = false
), creator_rows AS (
  SELECT
    COALESCE(p.profile_id, c.profile_id),
    'product-created:' || o.id::text,
    'product_created',
    CASE WHEN o.partner_id IS NOT NULL THEN 'partner' ELSE 'professional' END,
    COALESCE(o.partner_id, o.professional_coach_id),
    o.id,
    COALESCE(o.partner_net_amount, 0)::numeric,
    CASE WHEN o.financial_available_at <= now() THEN 'available' ELSE 'hold' END,
    o.financial_available_at,
    COALESCE(o.paid_at, o.created_at),
    'Líquido de produto criado'
  FROM paid_orders o
  LEFT JOIN public.partners p ON p.id = o.partner_id
  LEFT JOIN public.coaches c ON c.id = o.professional_coach_id
  WHERE COALESCE(p.profile_id, c.profile_id) IS NOT NULL
    AND (_profile_id IS NULL OR COALESCE(p.profile_id, c.profile_id) = _profile_id)
), coproduction_debits AS (
  SELECT
    COALESCE(p.profile_id, c.profile_id),
    'coproduction-paid:' || cc.id::text,
    'coproduction_paid',
    CASE WHEN pc.creator_type = 'partner' THEN 'partner' ELSE 'professional' END,
    pc.creator_id,
    cc.order_id,
    (-cc.amount_brl)::numeric,
    CASE WHEN o.financial_available_at <= now() THEN 'available' ELSE 'hold' END,
    o.financial_available_at,
    cc.created_at,
    'Repasse de co-produção'
  FROM public.product_coproduction_credits cc
  JOIN public.product_coproductions pc ON pc.id = cc.coproduction_id
  JOIN paid_orders o ON o.id = cc.order_id
  LEFT JOIN public.partners p ON pc.creator_type = 'partner' AND p.id = pc.creator_id
  LEFT JOIN public.coaches c ON pc.creator_type <> 'partner' AND c.id = pc.creator_id
  WHERE COALESCE(p.profile_id, c.profile_id) IS NOT NULL
    AND (_profile_id IS NULL OR COALESCE(p.profile_id, c.profile_id) = _profile_id)
), coproduction_credits AS (
  SELECT
    COALESCE(p.profile_id, c.profile_id),
    'coproduction-received:' || cc.id::text,
    'coproduction_received',
    CASE WHEN cc.collaborator_type = 'partner' THEN 'partner' ELSE 'professional' END,
    cc.collaborator_id,
    cc.order_id,
    cc.amount_brl::numeric,
    CASE WHEN o.financial_available_at <= now() THEN 'available' ELSE 'hold' END,
    o.financial_available_at,
    cc.created_at,
    'Co-produção recebida'
  FROM public.product_coproduction_credits cc
  JOIN paid_orders o ON o.id = cc.order_id
  LEFT JOIN public.partners p ON cc.collaborator_type = 'partner' AND p.id = cc.collaborator_id
  LEFT JOIN public.coaches c ON cc.collaborator_type <> 'partner' AND c.id = cc.collaborator_id
  WHERE COALESCE(p.profile_id, c.profile_id) IS NOT NULL
    AND (_profile_id IS NULL OR COALESCE(p.profile_id, c.profile_id) = _profile_id)
)
SELECT * FROM commission_rows
UNION ALL SELECT * FROM creator_rows
UNION ALL SELECT * FROM coproduction_debits
UNION ALL SELECT * FROM coproduction_credits;
$function$;

REVOKE ALL ON FUNCTION public.financial_ledger_events(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.financial_ledger_events(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_statement(_profile_id uuid, _recalc boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user_id uuid;
  v_student_ids uuid[];
  v_released numeric := 0;
  v_hold numeric := 0;
  v_network_blocked numeric := 0;
  v_earned numeric := 0;
  v_withdrawn_paid numeric := 0;
  v_withdraw_open numeric := 0;
  v_student_withdrawn_paid numeric := 0;
  v_student_withdraw_open numeric := 0;
  v_spent numeric := 0;
  v_advance_open numeric := 0;
  v_advance_settled numeric := 0;
  v_advance_total numeric := 0;
  v_available numeric := 0;
  v_overpaid numeric := 0;
  v_fitcoin_available numeric := 0;
  v_fitcoin_pending numeric := 0;
  v_fitcoin_earned numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN '{}'::jsonb; END IF;
  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = _profile_id;
  SELECT array_agg(id) INTO v_student_ids FROM public.students WHERE profile_id = _profile_id;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE source_kind <> 'fitcoin' AND state = 'available'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind <> 'fitcoin' AND state = 'hold'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind <> 'fitcoin' AND state = 'network_blocked'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind <> 'fitcoin'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind = 'fitcoin' AND state = 'available'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind = 'fitcoin' AND state = 'hold'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind = 'fitcoin'), 0)
  INTO v_released, v_hold, v_network_blocked, v_earned,
       v_fitcoin_available, v_fitcoin_pending, v_fitcoin_earned
  FROM public.financial_ledger_events(_profile_id);

  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0),
         COALESCE(SUM(amount) FILTER (WHERE status IN ('requested','approved','processing')), 0)
  INTO v_withdrawn_paid, v_withdraw_open
  FROM public.withdrawal_requests WHERE profile_id = _profile_id;

  IF v_student_ids IS NOT NULL THEN
    SELECT COALESCE(SUM(amount) FILTER (WHERE status::text = 'paid'), 0),
           COALESCE(SUM(amount) FILTER (WHERE status::text IN ('requested','approved','processing')), 0)
    INTO v_student_withdrawn_paid, v_student_withdraw_open
    FROM public.student_withdrawal_requests WHERE student_id = ANY(v_student_ids);
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount),0) INTO v_spent
    FROM public.subscription_invoices
    WHERE user_id=v_user_id AND status='paid' AND payment_method='wallet';
  END IF;
  IF v_student_ids IS NOT NULL THEN
    v_spent := v_spent
      + COALESCE((SELECT SUM(total_amount) FROM public.store_orders WHERE student_id=ANY(v_student_ids) AND status='paid' AND payment_method::text='wallet'),0)
      + COALESCE((SELECT SUM(gross_amount) FROM public.partner_product_orders WHERE student_id=ANY(v_student_ids) AND status='paid' AND payment_method='wallet'),0);
  END IF;

  SELECT COALESCE(SUM(GREATEST(amount-settled_amount,0)),0),
         COALESCE(SUM(LEAST(settled_amount,amount)),0), COALESCE(SUM(amount),0)
  INTO v_advance_open, v_advance_settled, v_advance_total
  FROM public.wallet_advances WHERE profile_id=_profile_id;

  v_available := v_released - v_withdrawn_paid - v_withdraw_open - v_spent - v_advance_open;
  v_overpaid := GREATEST(-v_available,0);

  RETURN jsonb_build_object(
    'profile_id',_profile_id,'generated_at',now(),
    'available',round(GREATEST(v_available,0),2),
    'available_before_advance',round(GREATEST(v_available+v_advance_open,0),2),
    'overpaid',round(v_overpaid,2),'released_total',round(v_released,2),
    'advance_open',round(v_advance_open,2),'advance_settled',round(v_advance_settled,2),'advance_total',round(v_advance_total,2),
    'hold',round(v_hold,2),'hold_coach',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='coach' AND state='hold'),0),2),
    'network_blocked',round(v_network_blocked,2),'pending_total',round(v_hold+v_network_blocked,2),
    'withdraw_open',round(v_withdraw_open+v_student_withdraw_open,2),
    'withdrawn_paid',round(v_withdrawn_paid+v_student_withdrawn_paid,2),
    'spent_wallet',round(v_spent,2),'total_earned',round(v_earned,2),
    'sources',jsonb_build_object(
      'coach',jsonb_build_object(
        'available',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='coach' AND state='available'),0),2),
        'hold',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='coach' AND state='hold'),0),2),
        'earned',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='coach'),0),2)),
      'partner',jsonb_build_object(
        'available',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='partner' AND state='available'),0),2),
        'hold',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='partner' AND state='hold'),0),2),
        'earned',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='partner'),0),2)),
      'professional',jsonb_build_object(
        'available',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='professional' AND state='available'),0),2),
        'hold',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='professional' AND state='hold'),0),2),
        'earned',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='professional'),0),2))),
    'fitcoin',jsonb_build_object('available',round(v_fitcoin_available,2),'pending',round(v_fitcoin_pending,2),'earned',round(v_fitcoin_earned,2)),
    'breakdown',jsonb_build_object(
      'commissions',jsonb_build_object(
        'available',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_type='commission' AND state='available'),0),2),
        'pending',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_type='commission' AND state='hold'),0),2),
        'released_total',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_type='commission' AND state='available'),0),2),
        'earned',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_type='commission'),0),2),'withdrawn',0),
      'creator',jsonb_build_object(
        'available',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_type IN ('product_created','coproduction_paid','coproduction_received') AND state='available'),0),2),
        'pending',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_type IN ('product_created','coproduction_paid','coproduction_received') AND state='hold'),0),2),
        'earned',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_type IN ('product_created','coproduction_paid','coproduction_received')),0),2),'withdrawn',0),
      'referral',jsonb_build_object('available',round(v_fitcoin_available,2),'pending',round(v_fitcoin_pending,2),'earned',round(v_fitcoin_earned,2)))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.wallet_statement(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_statement(uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.wallet_statement_bulk(_profile_ids uuid[])
RETURNS TABLE(profile_id uuid, statement jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $function$
  SELECT pid, public.wallet_statement(pid,false)
  FROM unnest(COALESCE(_profile_ids,'{}'::uuid[])) pid;
$function$;
REVOKE ALL ON FUNCTION public.wallet_statement_bulk(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_statement_bulk(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.recalc_wallets_for_owner(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=public
AS $function$
DECLARE r record;
BEGIN
  IF _profile_id IS NULL OR current_setting('fitmind.deleting_profile_id',true)=_profile_id::text THEN RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=_profile_id) THEN RETURN; END IF;

  INSERT INTO public.wallets(profile_id,available_balance,pending_balance,total_earned,total_withdrawn,updated_at)
  SELECT _profile_id,
    round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='available'),0),0),2),
    round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state IN ('hold','network_blocked')),0),0),2),
    round(COALESCE(SUM(amount),0),2),
    round(COALESCE((SELECT SUM(amount) FROM public.withdrawal_requests WHERE profile_id=_profile_id AND status='paid'),0),2),now()
  FROM public.financial_ledger_events(_profile_id) WHERE source_kind='coach' AND source_type='commission'
  ON CONFLICT(profile_id) DO UPDATE SET available_balance=EXCLUDED.available_balance,pending_balance=EXCLUDED.pending_balance,
    total_earned=EXCLUDED.total_earned,total_withdrawn=EXCLUDED.total_withdrawn,updated_at=now();

  FOR r IN SELECT id FROM public.partners WHERE profile_id=_profile_id LOOP
    INSERT INTO public.partner_wallets(partner_id,available_balance,pending_balance,total_earned,total_withdrawn,updated_at)
    SELECT r.id,
      round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='available'),0),0),2),
      round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='hold'),0),0),2),
      round(COALESCE(SUM(amount),0),2),0,now()
    FROM public.financial_ledger_events(_profile_id)
    WHERE source_kind='partner' AND wallet_owner_id=r.id
    ON CONFLICT(partner_id) DO UPDATE SET available_balance=EXCLUDED.available_balance,pending_balance=EXCLUDED.pending_balance,
      total_earned=EXCLUDED.total_earned,total_withdrawn=EXCLUDED.total_withdrawn,updated_at=now();
  END LOOP;

  FOR r IN SELECT id FROM public.coaches WHERE profile_id=_profile_id LOOP
    INSERT INTO public.professional_wallets(professional_coach_id,available_balance,pending_balance,total_earned,total_withdrawn,updated_at)
    SELECT r.id,
      round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='available'),0),0),2),
      round(GREATEST(COALESCE(SUM(amount) FILTER(WHERE state='hold'),0),0),2),
      round(COALESCE(SUM(amount),0),2),0,now()
    FROM public.financial_ledger_events(_profile_id)
    WHERE source_kind='professional' AND wallet_owner_id=r.id
    ON CONFLICT(professional_coach_id) DO UPDATE SET available_balance=EXCLUDED.available_balance,pending_balance=EXCLUDED.pending_balance,
      total_earned=EXCLUDED.total_earned,total_withdrawn=EXCLUDED.total_withdrawn,updated_at=now();
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_wallet_for_profile(_profile_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$ BEGIN PERFORM public.recalc_wallets_for_owner(_profile_id); END; $function$;

CREATE OR REPLACE FUNCTION public.admin_payables_report()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=public
AS $function$
WITH candidate_profiles AS (
  SELECT DISTINCT beneficiary_profile_id AS profile_id
  FROM public.financial_ledger_events(NULL) WHERE source_kind<>'fitcoin'
), statements AS (
  SELECT c.profile_id, public.wallet_statement(c.profile_id,false) statement FROM candidate_profiles c
), people AS (
  SELECT s.profile_id,p.name,p.email,
    CASE WHEN EXISTS(SELECT 1 FROM public.partners x WHERE x.profile_id=s.profile_id) THEN 'partner'
         WHEN EXISTS(SELECT 1 FROM public.coaches x WHERE x.profile_id=s.profile_id AND x.is_professional) THEN 'professional' ELSE 'coach' END kind,
    (s.statement->>'available')::numeric available,(s.statement->>'pending_total')::numeric pending,
    (s.statement->>'withdrawn_paid')::numeric withdrawn,(s.statement->>'withdraw_open')::numeric requested,
    (SELECT min(l.available_at) FROM public.financial_ledger_events(s.profile_id) l WHERE l.state='hold' AND l.amount>0) next_release_at
  FROM statements s JOIN public.profiles p ON p.id=s.profile_id
), projection AS (
  SELECT COALESCE(to_char(l.available_at AT TIME ZONE 'America/Cuiaba','YYYY-MM'),'sem_data') AS release_month,
         round(SUM(l.amount),2) AS release_amount,count(*)::int AS release_count
  FROM public.financial_ledger_events(NULL) l
  WHERE l.state='hold' AND l.amount>0 AND l.source_kind<>'fitcoin' GROUP BY 1
), withdrawals AS (
  SELECT w.id,w.profile_id,p.name,
    CASE WHEN EXISTS(SELECT 1 FROM public.partners x WHERE x.profile_id=w.profile_id) THEN 'partner'
         WHEN EXISTS(SELECT 1 FROM public.coaches x WHERE x.profile_id=w.profile_id AND x.is_professional) THEN 'professional' ELSE 'coach' END kind,
    w.amount,w.status::text status,w.requested_at,w.paid_at
  FROM public.withdrawal_requests w LEFT JOIN public.profiles p ON p.id=w.profile_id
), summary AS (
  SELECT round(COALESCE(SUM(available),0),2) available,round(COALESCE(SUM(pending),0),2) pending,
    round(COALESCE(SUM(requested),0),2) requested_open,count(*) FILTER(WHERE available>0 OR pending>0)::int people_with_balance FROM people
)
SELECT jsonb_build_object(
  'generatedAt',now(),
  'summary',jsonb_build_object('available',sm.available,'pending',sm.pending,'requestedOpen',sm.requested_open,
    'paidThisMonth',COALESCE((SELECT round(SUM(amount),2) FROM withdrawals WHERE status='paid' AND paid_at>=date_trunc('month',now() AT TIME ZONE 'America/Cuiaba') AT TIME ZONE 'America/Cuiaba'),0),
    'paidTotal',COALESCE((SELECT round(SUM(amount),2) FROM withdrawals WHERE status='paid'),0),'peopleWithBalance',sm.people_with_balance),
  'people',COALESCE((SELECT jsonb_agg(jsonb_build_object('profileId',profile_id,'name',COALESCE(name,'—'),'email',email,'kind',kind,
    'available',available,'pending',pending,'withdrawn',withdrawn,'requested',requested,'nextReleaseAt',next_release_at) ORDER BY available+pending DESC)
    FROM people WHERE available<>0 OR pending<>0 OR withdrawn<>0 OR requested<>0),'[]'::jsonb),
  'projection',COALESCE((SELECT jsonb_agg(jsonb_build_object('month',release_month,'amount',release_amount,'count',release_count) ORDER BY release_month) FROM projection),'[]'::jsonb),
  'withdrawals',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',id,'profileId',profile_id,'name',COALESCE(name,'—'),'kind',kind,
    'amount',amount,'status',status,'requestedAt',requested_at,'paidAt',paid_at) ORDER BY requested_at DESC) FROM withdrawals),'[]'::jsonb)
) FROM summary sm;
$function$;
REVOKE ALL ON FUNCTION public.admin_payables_report() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_payables_report() TO service_role;

CREATE OR REPLACE FUNCTION public.sync_financial_owner_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$
DECLARE v_profile_id uuid;
BEGIN
  IF TG_TABLE_NAME='commissions' THEN v_profile_id:=COALESCE(NEW.beneficiary_profile_id,OLD.beneficiary_profile_id);
  ELSIF TG_TABLE_NAME='product_coproduction_credits' THEN
    SELECT COALESCE(p.profile_id,c.profile_id) INTO v_profile_id
    FROM public.product_coproduction_credits cc
    LEFT JOIN public.partners p ON cc.collaborator_type='partner' AND p.id=cc.collaborator_id
    LEFT JOIN public.coaches c ON cc.collaborator_type<>'partner' AND c.id=cc.collaborator_id
    WHERE cc.id=COALESCE(NEW.id,OLD.id);
  ELSE
    SELECT COALESCE(p.profile_id,c.profile_id) INTO v_profile_id
    FROM public.partners p FULL JOIN public.coaches c ON false
    WHERE p.id=COALESCE(NEW.partner_id,OLD.partner_id) OR c.id=COALESCE(NEW.professional_coach_id,OLD.professional_coach_id) LIMIT 1;
  END IF;
  IF v_profile_id IS NOT NULL THEN PERFORM public.recalc_wallets_for_owner(v_profile_id); END IF;
  RETURN COALESCE(NEW,OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_financial_commission_recalc ON public.commissions;
CREATE TRIGGER trg_financial_commission_recalc AFTER INSERT OR UPDATE OR DELETE ON public.commissions FOR EACH ROW EXECUTE FUNCTION public.sync_financial_owner_wallet();
DROP TRIGGER IF EXISTS trg_financial_order_recalc ON public.partner_product_orders;
CREATE TRIGGER trg_financial_order_recalc AFTER INSERT OR UPDATE OR DELETE ON public.partner_product_orders FOR EACH ROW EXECUTE FUNCTION public.sync_financial_owner_wallet();

CREATE OR REPLACE FUNCTION public.sync_coproduction_wallets()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$
DECLARE v_profile_id uuid; v_order_id uuid:=COALESCE(NEW.order_id,OLD.order_id); v_coproduction_id uuid:=COALESCE(NEW.coproduction_id,OLD.coproduction_id);
BEGIN
  SELECT COALESCE(p.profile_id,c.profile_id) INTO v_profile_id FROM public.product_coproduction_credits cc
  LEFT JOIN public.partners p ON cc.collaborator_type='partner' AND p.id=cc.collaborator_id
  LEFT JOIN public.coaches c ON cc.collaborator_type<>'partner' AND c.id=cc.collaborator_id
  WHERE cc.id=COALESCE(NEW.id,OLD.id);
  IF v_profile_id IS NOT NULL THEN PERFORM public.recalc_wallets_for_owner(v_profile_id); END IF;
  SELECT COALESCE(p.profile_id,c.profile_id) INTO v_profile_id FROM public.product_coproductions pc
  LEFT JOIN public.partners p ON pc.creator_type='partner' AND p.id=pc.creator_id
  LEFT JOIN public.coaches c ON pc.creator_type<>'partner' AND c.id=pc.creator_id WHERE pc.id=v_coproduction_id;
  IF v_profile_id IS NOT NULL THEN PERFORM public.recalc_wallets_for_owner(v_profile_id); END IF;
  RETURN COALESCE(NEW,OLD);
END;
$function$;
DROP TRIGGER IF EXISTS trg_financial_coproduction_recalc ON public.product_coproduction_credits;
CREATE TRIGGER trg_financial_coproduction_recalc AFTER INSERT OR UPDATE OR DELETE ON public.product_coproduction_credits FOR EACH ROW EXECUTE FUNCTION public.sync_coproduction_wallets();