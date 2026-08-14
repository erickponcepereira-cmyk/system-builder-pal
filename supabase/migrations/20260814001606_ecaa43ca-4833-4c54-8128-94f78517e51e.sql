CREATE TABLE public.wallet_audit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  triggered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  wallets_checked integer NOT NULL DEFAULT 0,
  diffs_count integer NOT NULL DEFAULT 0,
  total_delta numeric NOT NULL DEFAULT 0
);

CREATE TABLE public.wallet_audit_diffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.wallet_audit_runs(id) ON DELETE CASCADE,
  profile_id uuid,
  person_name text,
  wallet_kind text NOT NULL,
  field text NOT NULL,
  before_value numeric NOT NULL DEFAULT 0,
  after_value numeric NOT NULL DEFAULT 0,
  delta numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_audit_diffs_run ON public.wallet_audit_diffs(run_id);

GRANT SELECT ON public.wallet_audit_runs TO authenticated;
GRANT SELECT ON public.wallet_audit_diffs TO authenticated;
GRANT ALL ON public.wallet_audit_runs TO service_role;
GRANT ALL ON public.wallet_audit_diffs TO service_role;

ALTER TABLE public.wallet_audit_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_audit_diffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read wallet audit runs" ON public.wallet_audit_runs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "admins read wallet audit diffs" ON public.wallet_audit_diffs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_wallet_audit_run(_admin_user_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(_admin_user_id, auth.uid());
  v_run_id uuid;
  v_admin_profile uuid;
  v_checked integer := 0;
  v_diffs integer := 0;
  v_delta numeric := 0;
  r record;
BEGIN
  IF NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO v_admin_profile FROM public.profiles WHERE user_id = v_uid;

  CREATE TEMP TABLE _wa_before ON COMMIT DROP AS
    SELECT profile_id, 'coach'::text AS kind, available_balance, pending_balance
      FROM public.wallets
    UNION ALL
    SELECT p.profile_id, 'partner', w.available_balance, w.pending_balance
      FROM public.partner_wallets w JOIN public.partners p ON p.id = w.partner_id
    UNION ALL
    SELECT c.profile_id, 'professional', w.available_balance, w.pending_balance
      FROM public.professional_wallets w JOIN public.coaches c ON c.id = w.professional_coach_id;

  SELECT count(*) INTO v_checked FROM _wa_before;

  FOR r IN
    SELECT DISTINCT pid FROM (
      SELECT id AS pid FROM public.profiles
      UNION SELECT beneficiary_profile_id FROM public.commissions WHERE beneficiary_profile_id IS NOT NULL
      UNION SELECT profile_id FROM public.withdrawal_requests WHERE profile_id IS NOT NULL
    ) x WHERE pid IS NOT NULL
  LOOP
    BEGIN
      PERFORM public.recalc_wallets_for_owner(r.pid);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  CREATE TEMP TABLE _wa_after ON COMMIT DROP AS
    SELECT profile_id, 'coach'::text AS kind, available_balance, pending_balance
      FROM public.wallets
    UNION ALL
    SELECT p.profile_id, 'partner', w.available_balance, w.pending_balance
      FROM public.partner_wallets w JOIN public.partners p ON p.id = w.partner_id
    UNION ALL
    SELECT c.profile_id, 'professional', w.available_balance, w.pending_balance
      FROM public.professional_wallets w JOIN public.coaches c ON c.id = w.professional_coach_id;

  INSERT INTO public.wallet_audit_runs (id, triggered_by, wallets_checked)
  VALUES (gen_random_uuid(), v_admin_profile, v_checked)
  RETURNING id INTO v_run_id;

  INSERT INTO public.wallet_audit_diffs (run_id, profile_id, person_name, wallet_kind, field, before_value, after_value, delta)
  SELECT v_run_id, COALESCE(a.profile_id, b.profile_id), pr.name, COALESCE(a.kind, b.kind), f.field,
         f.before_v, f.after_v, ROUND((f.after_v - f.before_v)::numeric, 2)
  FROM _wa_after a
  FULL JOIN _wa_before b ON b.profile_id = a.profile_id AND b.kind = a.kind
  LEFT JOIN public.profiles pr ON pr.id = COALESCE(a.profile_id, b.profile_id)
  CROSS JOIN LATERAL (
    VALUES
      ('available', COALESCE(b.available_balance, 0), COALESCE(a.available_balance, 0)),
      ('pending',   COALESCE(b.pending_balance, 0),   COALESCE(a.pending_balance, 0))
  ) AS f(field, before_v, after_v)
  WHERE ABS(COALESCE(f.after_v, 0) - COALESCE(f.before_v, 0)) > 0.005;

  SELECT count(*), COALESCE(SUM(delta), 0) INTO v_diffs, v_delta
  FROM public.wallet_audit_diffs WHERE run_id = v_run_id;

  UPDATE public.wallet_audit_runs
     SET diffs_count = v_diffs, total_delta = v_delta
   WHERE id = v_run_id;

  RETURN v_run_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.admin_wallet_audit_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_wallet_audit_run(uuid) TO authenticated, service_role;