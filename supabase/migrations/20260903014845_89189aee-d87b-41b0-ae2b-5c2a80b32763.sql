-- 1) Ledger com marcação de rede e mês de referência
DROP FUNCTION IF EXISTS public.financial_ledger_events(uuid);

CREATE FUNCTION public.financial_ledger_events(_profile_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  beneficiary_profile_id uuid,
  ledger_key text,
  source_type text,
  source_kind text,
  wallet_owner_id uuid,
  reference_id uuid,
  amount numeric,
  state text,
  available_at timestamp with time zone,
  occurred_at timestamp with time zone,
  description text,
  is_network boolean,
  period_key text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
    COALESCE(c.slot_label, 'Comissão'),
    COALESCE(c.is_network, false) AND NOT COALESCE(c.is_referral, false),
    to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM')
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
    'Líquido de produto criado',
    false,
    to_char(COALESCE(o.paid_at, o.created_at) AT TIME ZONE 'UTC', 'YYYY-MM')
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
    'Repasse de co-produção',
    false,
    to_char(cc.created_at AT TIME ZONE 'UTC', 'YYYY-MM')
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
    'Co-produção recebida',
    false,
    to_char(cc.created_at AT TIME ZONE 'UTC', 'YYYY-MM')
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

-- 2) Extrato separa carência de rede e de venda direta, e detalha rede por mês
CREATE OR REPLACE FUNCTION public.wallet_statement(_profile_id uuid, _recalc boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_student_ids uuid[];
  v_released numeric := 0;
  v_hold numeric := 0;
  v_hold_direct numeric := 0;
  v_hold_network numeric := 0;
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
  v_network_months jsonb := '[]'::jsonb;
BEGIN
  IF _profile_id IS NULL THEN RETURN '{}'::jsonb; END IF;
  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = _profile_id;
  SELECT array_agg(id) INTO v_student_ids FROM public.students WHERE profile_id = _profile_id;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE source_kind <> 'fitcoin' AND state = 'available'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind <> 'fitcoin' AND state = 'hold'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind <> 'fitcoin' AND state = 'hold' AND NOT is_network), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind <> 'fitcoin' AND state = 'hold' AND is_network), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind <> 'fitcoin' AND state = 'network_blocked'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind <> 'fitcoin'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind = 'fitcoin' AND state = 'available'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind = 'fitcoin' AND state = 'hold'), 0),
    COALESCE(SUM(amount) FILTER (WHERE source_kind = 'fitcoin'), 0)
  INTO v_released, v_hold, v_hold_direct, v_hold_network, v_network_blocked, v_earned,
       v_fitcoin_available, v_fitcoin_pending, v_fitcoin_earned
  FROM public.financial_ledger_events(_profile_id);

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'period' DESC), '[]'::jsonb) INTO v_network_months
  FROM (
    SELECT jsonb_build_object(
             'period', e.period_key,
             'hold', round(SUM(e.amount) FILTER (WHERE e.state = 'hold'), 2),
             'blocked', round(SUM(e.amount) FILTER (WHERE e.state = 'network_blocked'), 2),
             'released', round(SUM(e.amount) FILTER (WHERE e.state = 'available'), 2),
             'goal_met', COALESCE((
               SELECT nuh.any_completed FROM public.network_unlock_history nuh
               WHERE nuh.profile_id = _profile_id
                 AND nuh.period_year = split_part(e.period_key, '-', 1)::int
                 AND nuh.period_month = split_part(e.period_key, '-', 2)::int
             ), false)
           ) AS x
    FROM public.financial_ledger_events(_profile_id) e
    WHERE e.is_network
    GROUP BY e.period_key
  ) s;

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
    'hold',round(v_hold,2),
    'hold_direct',round(v_hold_direct,2),
    'hold_network',round(v_hold_network,2),
    'network_by_month',v_network_months,
    'hold_coach',round(COALESCE((SELECT SUM(amount) FROM public.financial_ledger_events(_profile_id) WHERE source_kind='coach' AND state='hold'),0),2),
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

-- 3) Lista de antecipação usando o mesmo extrato deduplicado
CREATE OR REPLACE FUNCTION public.admin_blocked_commissions(_profile_id uuid, _admin_user_id uuid)
RETURNS TABLE(
  commission_id uuid,
  amount numeric,
  slot_label text,
  is_network boolean,
  period_key text,
  state text,
  available_at timestamp with time zone,
  created_at timestamp with time zone,
  goal_met boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    substring(e.ledger_key from 12)::uuid,
    e.amount,
    e.description,
    e.is_network,
    e.period_key,
    e.state,
    e.available_at,
    e.occurred_at,
    COALESCE((
      SELECT nuh.any_completed FROM public.network_unlock_history nuh
      WHERE nuh.profile_id = _profile_id
        AND nuh.period_year = split_part(e.period_key, '-', 1)::int
        AND nuh.period_month = split_part(e.period_key, '-', 2)::int
    ), false)
  FROM public.financial_ledger_events(_profile_id) e
  WHERE public.is_admin(_admin_user_id)
    AND e.source_type = 'commission'
    AND e.state IN ('hold', 'network_blocked')
  ORDER BY e.occurred_at DESC;
$function$;

REVOKE ALL ON FUNCTION public.admin_blocked_commissions(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_blocked_commissions(uuid, uuid) TO authenticated, service_role;

-- 4) Auditoria de comissões duplicadas removidas
CREATE TABLE IF NOT EXISTS public.commission_duplicates_removed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL,
  profile_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  slot_label text,
  status text,
  transaction_id uuid,
  partner_order_id uuid,
  original_created_at timestamptz,
  removed_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.commission_duplicates_removed TO authenticated;
GRANT ALL ON public.commission_duplicates_removed TO service_role;
ALTER TABLE public.commission_duplicates_removed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins leem duplicidades removidas" ON public.commission_duplicates_removed;
CREATE POLICY "Admins leem duplicidades removidas"
  ON public.commission_duplicates_removed FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));