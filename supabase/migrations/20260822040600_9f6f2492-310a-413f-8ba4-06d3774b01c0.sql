CREATE OR REPLACE FUNCTION public.wallets_overview()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH rows AS (
  SELECT 'commission'::text AS kind, w.profile_id,
         COALESCE(w.available_balance,0) AS available, COALESCE(w.pending_balance,0) AS pending,
         0::numeric AS blocked, COALESCE(w.total_earned,0) AS earned, COALESCE(w.total_withdrawn,0) AS withdrawn
  FROM public.wallets w
  UNION ALL
  SELECT 'partner', p.profile_id,
         COALESCE(pw.available_balance,0), COALESCE(pw.pending_balance,0), 0,
         COALESCE(pw.total_earned,0), COALESCE(pw.total_withdrawn,0)
  FROM public.partner_wallets pw JOIN public.partners p ON p.id = pw.partner_id
  UNION ALL
  SELECT 'professional', c.profile_id,
         COALESCE(fw.available_balance,0), COALESCE(fw.pending_balance,0), 0,
         COALESCE(fw.total_earned,0), COALESCE(fw.total_withdrawn,0)
  FROM public.professional_wallets fw JOIN public.coaches c ON c.id = fw.professional_coach_id
  UNION ALL
  SELECT 'fitcoin', s.profile_id,
         COALESCE(sw.available_balance,0), COALESCE(sw.pending_balance,0), 0,
         COALESCE(sw.total_earned,0), COALESCE(sw.total_withdrawn,0)
  FROM public.student_wallets sw JOIN public.students s ON s.id = sw.student_id
  UNION ALL
  SELECT 'nutritionist', nw.profile_id,
         COALESCE(nw.available_balance,0), 0, COALESCE(nw.blocked_balance,0),
         COALESCE(nw.total_earned,0), COALESCE(nw.total_withdrawn,0)
  FROM public.nutritionist_wallets nw
  UNION ALL
  SELECT 'professor', pr.profile_id,
         COALESCE(pr.available_balance,0), 0, COALESCE(pr.blocked_balance,0),
         COALESCE(pr.total_earned,0), COALESCE(pr.total_withdrawn,0)
  FROM public.professor_wallets pr
),
clean AS (SELECT * FROM rows WHERE profile_id IS NOT NULL),
by_kind AS (
  SELECT kind,
         COUNT(*) FILTER (WHERE available <> 0 OR pending <> 0 OR blocked <> 0 OR earned <> 0) AS people,
         SUM(available) AS available, SUM(pending) AS pending, SUM(blocked) AS blocked,
         SUM(earned) AS earned, SUM(withdrawn) AS withdrawn
  FROM clean GROUP BY kind
),
by_person AS (
  SELECT c.profile_id,
         SUM(c.available) AS available, SUM(c.pending) AS pending, SUM(c.blocked) AS blocked,
         SUM(c.earned) AS earned, SUM(c.withdrawn) AS withdrawn,
         jsonb_object_agg(c.kind, jsonb_build_object(
           'available', round(c.available,2), 'pending', round(c.pending,2),
           'blocked', round(c.blocked,2), 'earned', round(c.earned,2), 'withdrawn', round(c.withdrawn,2)
         )) AS kinds
  FROM clean c GROUP BY c.profile_id
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'admin_wallet', (SELECT jsonb_build_object(
        'available', round(COALESCE(available_balance,0),2),
        'earned', round(COALESCE(total_earned,0),2),
        'withdrawn', round(COALESCE(total_withdrawn,0),2))
      FROM public.admin_system_wallet LIMIT 1),
  'advances_open', (SELECT round(COALESCE(SUM(GREATEST(amount - settled_amount,0)),0),2) FROM public.wallet_advances),
  'totals', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'kind', kind, 'people', people,
      'available', round(available,2), 'pending', round(pending,2), 'blocked', round(blocked,2),
      'earned', round(earned,2), 'withdrawn', round(withdrawn,2)) ORDER BY kind) FROM by_kind), '[]'::jsonb),
  'people', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'profile_id', bp.profile_id,
      'name', COALESCE(p.name, 'Sem nome'),
      'email', p.email,
      'available', round(bp.available,2), 'pending', round(bp.pending,2), 'blocked', round(bp.blocked,2),
      'earned', round(bp.earned,2), 'withdrawn', round(bp.withdrawn,2),
      'advance_open', round(COALESCE((SELECT SUM(GREATEST(a.amount - a.settled_amount,0))
                                      FROM public.wallet_advances a WHERE a.profile_id = bp.profile_id),0),2),
      'kinds', bp.kinds) ORDER BY bp.available DESC)
    FROM by_person bp LEFT JOIN public.profiles p ON p.id = bp.profile_id
    WHERE bp.available <> 0 OR bp.pending <> 0 OR bp.blocked <> 0 OR bp.earned <> 0), '[]'::jsonb)
);
$function$;

REVOKE ALL ON FUNCTION public.wallets_overview() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallets_overview() TO service_role;