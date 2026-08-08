-- ===== conferência dos registros de corrida =====
ALTER TABLE public.run_logs
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_note text;

-- ===== desafios de corrida =====
CREATE TABLE IF NOT EXISTS public.run_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  partner_product_id uuid REFERENCES public.partner_products(id) ON DELETE SET NULL,
  professional_product_id uuid REFERENCES public.professional_products(id) ON DELETE SET NULL,
  requires_ticket boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_challenges TO authenticated;
GRANT ALL ON public.run_challenges TO service_role;
ALTER TABLE public.run_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY rch_select ON public.run_challenges
  FOR SELECT TO authenticated USING (true);
CREATE POLICY rch_manage_owner ON public.run_challenges
  FOR ALL TO authenticated
  USING (public.current_user_is_admin() OR owner_coach_id = ANY (public.current_user_coach_ids()))
  WITH CHECK (public.current_user_is_admin() OR owner_coach_id = ANY (public.current_user_coach_ids()));

-- ===== faixas de meta =====
CREATE TABLE IF NOT EXISTS public.run_challenge_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.run_challenges(id) ON DELETE CASCADE,
  label text NOT NULL,
  target_km numeric(8,2) NOT NULL CHECK (target_km > 0),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.run_challenge_tiers TO authenticated;
GRANT ALL ON public.run_challenge_tiers TO service_role;
ALTER TABLE public.run_challenge_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY rct_select ON public.run_challenge_tiers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY rct_manage_owner ON public.run_challenge_tiers
  FOR ALL TO authenticated
  USING (public.current_user_is_admin() OR EXISTS (
    SELECT 1 FROM public.run_challenges c
     WHERE c.id = challenge_id AND c.owner_coach_id = ANY (public.current_user_coach_ids())))
  WITH CHECK (public.current_user_is_admin() OR EXISTS (
    SELECT 1 FROM public.run_challenges c
     WHERE c.id = challenge_id AND c.owner_coach_id = ANY (public.current_user_coach_ids())));

-- ===== tickets =====
CREATE TABLE IF NOT EXISTS public.run_challenge_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  owner_coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  challenge_id uuid REFERENCES public.run_challenges(id) ON DELETE SET NULL,
  source_order_id uuid,
  granted_by text NOT NULL DEFAULT 'purchase',
  notes text,
  consumed_at timestamptz,
  consumed_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.run_challenge_tickets TO authenticated;
GRANT ALL ON public.run_challenge_tickets TO service_role;
ALTER TABLE public.run_challenge_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY rcti_select_own ON public.run_challenge_tickets
  FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id()
         OR public.current_user_is_admin()
         OR owner_coach_id = ANY (public.current_user_coach_ids()));

-- ===== inscrições =====
CREATE TABLE IF NOT EXISTS public.run_challenge_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.run_challenges(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES public.run_challenge_tiers(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  goal_reached_at timestamptz,
  km_at_goal numeric(8,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, profile_id)
);

GRANT SELECT ON public.run_challenge_entries TO authenticated;
GRANT ALL ON public.run_challenge_entries TO service_role;
ALTER TABLE public.run_challenge_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY rce_select ON public.run_challenge_entries
  FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id()
         OR public.current_user_is_admin()
         OR EXISTS (SELECT 1 FROM public.run_challenges c
                     WHERE c.id = challenge_id
                       AND c.owner_coach_id = ANY (public.current_user_coach_ids())));

-- ===== progresso =====
CREATE OR REPLACE FUNCTION public.run_challenge_progress(_challenge_id uuid, _profile_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(r.distance_km), 0)::numeric
    FROM public.run_logs r
    JOIN public.run_challenges c ON c.id = _challenge_id
   WHERE r.profile_id = _profile_id
     AND r.run_date BETWEEN c.starts_on AND c.ends_on
     AND r.photo_url IS NOT NULL
     AND COALESCE(r.review_status, 'pending') <> 'rejected';
$$;

GRANT EXECUTE ON FUNCTION public.run_challenge_progress(uuid, uuid) TO authenticated, service_role;

-- marca a meta batida quando o acumulado cruza o alvo
CREATE OR REPLACE FUNCTION public.run_challenge_sync_goals(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE e record; v_km numeric; v_target numeric;
BEGIN
  FOR e IN
    SELECT en.id, en.challenge_id, t.target_km
      FROM public.run_challenge_entries en
      JOIN public.run_challenge_tiers t ON t.id = en.tier_id
     WHERE en.profile_id = _profile_id
  LOOP
    v_km := public.run_challenge_progress(e.challenge_id, _profile_id);
    v_target := e.target_km;
    IF v_km >= v_target THEN
      UPDATE public.run_challenge_entries
         SET goal_reached_at = COALESCE(goal_reached_at, now()),
             km_at_goal = COALESCE(km_at_goal, v_km),
             updated_at = now()
       WHERE id = e.id;
    ELSE
      UPDATE public.run_challenge_entries
         SET goal_reached_at = NULL, km_at_goal = NULL, updated_at = now()
       WHERE id = e.id AND goal_reached_at IS NOT NULL;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_run_logs_sync_goals()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.run_challenge_sync_goals(COALESCE(NEW.profile_id, OLD.profile_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_run_logs_goals ON public.run_logs;
CREATE TRIGGER trg_run_logs_goals
  AFTER INSERT OR UPDATE OR DELETE ON public.run_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_run_logs_sync_goals();

-- ===== entrega de tickets na compra aprovada =====
CREATE OR REPLACE FUNCTION public.grant_run_challenge_tickets(_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE o record; v_profile uuid; c record;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id;
  IF o.id IS NULL OR o.status <> 'paid' THEN RETURN; END IF;

  SELECT s.profile_id INTO v_profile FROM public.students s WHERE s.id = o.student_id;
  IF v_profile IS NULL THEN RETURN; END IF;

  FOR c IN
    SELECT rc.id, rc.owner_coach_id
      FROM public.run_challenges rc
     WHERE rc.is_active
       AND ((o.partner_product_id IS NOT NULL AND rc.partner_product_id = o.partner_product_id)
         OR (o.professional_product_id IS NOT NULL AND rc.professional_product_id = o.professional_product_id))
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.run_challenge_tickets t
       WHERE t.profile_id = v_profile
         AND t.owner_coach_id = c.owner_coach_id
         AND t.notes = 'order:' || o.id::text
    ) THEN
      INSERT INTO public.run_challenge_tickets (profile_id, owner_coach_id, source_order_id, granted_by, notes)
      VALUES (v_profile, c.owner_coach_id, o.id, 'purchase', 'order:' || o.id::text);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_ppo_run_tickets()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' THEN
    PERFORM public.grant_run_challenge_tickets(NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ppo_run_tickets ON public.partner_product_orders;
CREATE TRIGGER trg_ppo_run_tickets
  AFTER INSERT OR UPDATE OF status ON public.partner_product_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_ppo_run_tickets();
