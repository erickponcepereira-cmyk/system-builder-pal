-- Release batch after the latest Lovable migrations: Google Play UGC readiness, community policy acceptance, reports, blocks,
-- moderation actions/appeals, server-side enforcement and profile privacy fixes.

-- ---------------------------------------------------------------------------
-- 1. Privacy regression: an older blanket grant reopened every profile column
--    to anon. Keep anonymous reads limited to explicitly public fields.
-- ---------------------------------------------------------------------------
-- Table-level REVOKE does not remove older column-level ACLs in PostgreSQL.
-- Clear every anonymous column grant first, including columns added by prior
-- migrations, and only then grant the explicit public allow-list below.
DO $profile_anon_acl$
DECLARE
  v_columns text;
BEGIN
  SELECT string_agg(format('%I', a.attname), ', ' ORDER BY a.attnum)
  INTO v_columns
  FROM pg_attribute a
  WHERE a.attrelid = 'public.profiles'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_columns IS NOT NULL THEN
    EXECUTE format(
      'REVOKE SELECT (%s) ON public.profiles FROM PUBLIC, anon',
      v_columns
    );
  END IF;
END;
$profile_anon_acl$;
REVOKE SELECT ON public.profiles FROM PUBLIC, anon;
GRANT SELECT (
  id, name, avatar_url, photo_url, role,
  city, state, bio, instagram, patent, created_at
) ON public.profiles TO anon;

-- Group peers must be hydrated through ugc_group_public_profiles(), which only
-- returns four public fields. Row access to profiles must never be widened just
-- because two people share a challenge group.
DROP POLICY IF EXISTS profiles_group_member_select ON public.profiles;

-- WhatsApp group writes are performed only by the authenticated TanStack
-- server function with service_role after owner, policy and URL validation.
-- Keeping direct DML would let a modified client bypass every one of those
-- checks through PostgREST.
REVOKE INSERT, UPDATE, DELETE ON public.whatsapp_groups FROM authenticated;
ALTER TABLE public.whatsapp_groups
  DROP CONSTRAINT IF EXISTS whatsapp_groups_single_target_ck;
ALTER TABLE public.whatsapp_groups
  ADD CONSTRAINT whatsapp_groups_single_target_ck
  CHECK (num_nonnulls(invite_url, phone) = 1) NOT VALID;
ALTER TABLE public.whatsapp_groups
  DROP CONSTRAINT IF EXISTS whatsapp_groups_safe_target_ck;
ALTER TABLE public.whatsapp_groups
  ADD CONSTRAINT whatsapp_groups_safe_target_ck
  CHECK (
    (phone IS NULL OR phone ~ '^[0-9]{10,15}$')
    AND (
      invite_url IS NULL
      OR invite_url ~ '^https://(chat\.whatsapp\.com|wa\.me|api\.whatsapp\.com)(/|$)'
    )
  ) NOT VALID;
ALTER TABLE public.whatsapp_groups
  DROP CONSTRAINT IF EXISTS whatsapp_groups_content_length_ck;
ALTER TABLE public.whatsapp_groups
  ADD CONSTRAINT whatsapp_groups_content_length_ck
  CHECK (
    char_length(btrim(name)) BETWEEN 2 AND 120
    AND (description IS NULL OR char_length(description) <= 1000)
  ) NOT VALID;

-- Product reviews arrived on main after the first publication hardening pass.
-- Record who authored a seller reply and make the purchase identity explicit;
-- all untrusted writes are moved to narrow RPCs below.
ALTER TABLE public.product_reviews
  ADD COLUMN IF NOT EXISTS seller_reply_by_profile_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.product_reviews
  DROP CONSTRAINT IF EXISTS product_reviews_order_type_ck;
ALTER TABLE public.product_reviews
  ADD CONSTRAINT product_reviews_order_type_ck
  CHECK (order_type IN ('transaction', 'store_order', 'partner_product_order')) NOT VALID;
-- Existing rows were created by the two known purchase flows. Validate them
-- now so an unknown legacy value cannot remain readable but impossible to
-- update. Staging must stop here if historical data needs an explicit repair.
ALTER TABLE public.product_reviews
  VALIDATE CONSTRAINT product_reviews_order_type_ck;
ALTER TABLE public.product_reviews
  DROP CONSTRAINT IF EXISTS product_reviews_uma_por_compra;
ALTER TABLE public.product_reviews
  ADD CONSTRAINT product_reviews_uma_por_compra
  UNIQUE (order_id, order_type, product_origin, product_id);

-- ---------------------------------------------------------------------------
-- 2. Moderation data model.
-- ---------------------------------------------------------------------------
CREATE TABLE public.ugc_policy_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  policy_version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, policy_version),
  CONSTRAINT ugc_policy_version_ck CHECK (policy_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$')
);

CREATE TABLE public.ugc_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  blocked_whatsapp_group_id uuid REFERENCES public.whatsapp_groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ugc_blocks_one_target_ck CHECK (
    num_nonnulls(blocked_profile_id, blocked_partner_id, blocked_whatsapp_group_id) = 1
  ),
  CONSTRAINT ugc_blocks_not_self_ck CHECK (
    blocked_profile_id IS NULL OR blocker_profile_id <> blocked_profile_id
  )
);

CREATE UNIQUE INDEX ugc_blocks_profile_uq
  ON public.ugc_blocks(blocker_profile_id, blocked_profile_id)
  WHERE blocked_profile_id IS NOT NULL;
CREATE UNIQUE INDEX ugc_blocks_partner_uq
  ON public.ugc_blocks(blocker_profile_id, blocked_partner_id)
  WHERE blocked_partner_id IS NOT NULL;
CREATE UNIQUE INDEX ugc_blocks_whatsapp_uq
  ON public.ugc_blocks(blocker_profile_id, blocked_whatsapp_group_id)
  WHERE blocked_whatsapp_group_id IS NOT NULL;
CREATE INDEX ugc_blocks_reverse_profile_idx
  ON public.ugc_blocks(blocked_profile_id, blocker_profile_id)
  WHERE blocked_profile_id IS NOT NULL;

CREATE TABLE public.ugc_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_kind text NOT NULL CHECK (target_kind IN (
    'group_message', 'partner_post', 'product_review', 'product_review_reply',
    'profile', 'partner', 'whatsapp_group'
  )),
  target_id uuid NOT NULL,
  subject_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.challenge_groups(id) ON DELETE SET NULL,
  reason_code text NOT NULL CHECK (reason_code IN (
    'sexual_content', 'harassment', 'hate', 'violence', 'dangerous',
    'spam', 'impersonation', 'privacy', 'self_harm', 'illegal', 'other'
  )),
  details text,
  evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN (
    'open', 'reviewing', 'actioned', 'dismissed'
  )),
  assigned_to_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolution text,
  resolved_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ugc_reports_details_length_ck CHECK (
    details IS NULL OR char_length(details) <= 2000
  ),
  CONSTRAINT ugc_reports_resolution_length_ck CHECK (
    resolution IS NULL OR char_length(resolution) <= 3000
  )
);

CREATE UNIQUE INDEX ugc_reports_open_reporter_target_uq
  ON public.ugc_reports(reporter_profile_id, target_kind, target_id)
  WHERE reporter_profile_id IS NOT NULL AND status IN ('open', 'reviewing');
CREATE INDEX ugc_reports_queue_idx
  ON public.ugc_reports(status, created_at DESC);
CREATE INDEX ugc_reports_subject_profile_idx
  ON public.ugc_reports(subject_profile_id, created_at DESC);

CREATE TABLE public.ugc_moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.ugc_reports(id) ON DELETE SET NULL,
  subject_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject_partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'warning', 'hide_content', 'group_mute', 'group_ban',
    'suspend_posting', 'block_partner', 'deactivate_whatsapp_group'
  )),
  target_kind text,
  target_id uuid,
  group_id uuid REFERENCES public.challenge_groups(id) ON DELETE SET NULL,
  public_reason text NOT NULL,
  internal_notes text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ugc_action_expiry_ck CHECK (expires_at IS NULL OR expires_at > starts_at),
  CONSTRAINT ugc_action_reason_length_ck CHECK (
    char_length(public_reason) BETWEEN 3 AND 1000
  ),
  CONSTRAINT ugc_action_notes_length_ck CHECK (
    internal_notes IS NULL OR char_length(internal_notes) <= 3000
  )
);

CREATE INDEX ugc_actions_active_profile_idx
  ON public.ugc_moderation_actions(subject_profile_id, action_type, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX ugc_actions_report_idx
  ON public.ugc_moderation_actions(report_id, created_at DESC);

CREATE TABLE public.ugc_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id uuid NOT NULL REFERENCES public.ugc_moderation_actions(id) ON DELETE CASCADE,
  appellant_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  statement text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'reviewing', 'accepted', 'rejected'
  )),
  reviewer_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ugc_appeal_statement_length_ck CHECK (
    char_length(statement) BETWEEN 20 AND 3000
  ),
  CONSTRAINT ugc_appeal_decision_length_ck CHECK (
    decision IS NULL OR char_length(decision) <= 3000
  ),
  UNIQUE (action_id, appellant_profile_id)
);

CREATE TABLE public.ugc_media_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.ugc_reports(id) ON DELETE SET NULL,
  action_id uuid REFERENCES public.ugc_moderation_actions(id) ON DELETE SET NULL,
  operation text NOT NULL CHECK (operation IN ('quarantine', 'restore', 'delete')),
  source_bucket text NOT NULL,
  source_path text NOT NULL,
  evidence_bucket text NOT NULL DEFAULT 'ugc-evidence',
  evidence_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed', 'dead'
  )),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT ugc_media_jobs_path_length_ck CHECK (
    char_length(source_bucket) BETWEEN 1 AND 100
    AND char_length(source_path) BETWEEN 1 AND 4000
    AND (evidence_path IS NULL OR char_length(evidence_path) <= 1000)
  )
);
CREATE UNIQUE INDEX ugc_media_jobs_once_uq
  ON public.ugc_media_jobs(
    COALESCE(report_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(action_id, '00000000-0000-0000-0000-000000000000'::uuid),
    operation,
    source_bucket,
    source_path
  );
CREATE INDEX ugc_media_jobs_pending_idx
  ON public.ugc_media_jobs(status, created_at)
  WHERE status IN ('pending', 'failed');

INSERT INTO storage.buckets (id, name, public)
VALUES ('ugc-evidence', 'ugc-evidence', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE OR REPLACE FUNCTION public.ugc_can_moderate()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = auth.uid()
      AND p.role::text = 'admin'
      AND (
        COALESCE(p.is_master_admin, false)
        OR COALESCE(p.admin_permissions, '{}'::jsonb) @> '{"reports": true}'::jsonb
      )
  )
$$;

ALTER TABLE public.ugc_policy_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ugc_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ugc_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ugc_moderation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ugc_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ugc_media_jobs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.ugc_policy_acceptances, public.ugc_blocks,
  public.ugc_appeals TO authenticated;

-- Evidence snapshots and internal moderator notes must not be exposed through
-- PostgREST to the reporter/subject. Administrators read evidence through the
-- guarded admin_list_ugc_reports() RPC defined below.
REVOKE SELECT ON public.ugc_reports, public.ugc_moderation_actions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  id, reporter_profile_id, target_kind, target_id, subject_profile_id,
  subject_partner_id, group_id, reason_code, details, status, resolution,
  resolved_at, created_at, updated_at
) ON public.ugc_reports TO authenticated;
GRANT SELECT (
  id, report_id, subject_profile_id, subject_partner_id, action_type,
  target_kind, target_id, group_id, public_reason, starts_at, expires_at,
  revoked_at, created_at
) ON public.ugc_moderation_actions TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ugc_policy_acceptances, public.ugc_blocks,
  public.ugc_reports, public.ugc_moderation_actions, public.ugc_appeals
  FROM anon, authenticated;
GRANT ALL ON public.ugc_policy_acceptances, public.ugc_blocks,
  public.ugc_reports, public.ugc_moderation_actions, public.ugc_appeals,
  public.ugc_media_jobs
  TO service_role;
REVOKE ALL ON public.ugc_media_jobs FROM PUBLIC, anon, authenticated;

CREATE POLICY ugc_policy_acceptances_own_select
  ON public.ugc_policy_acceptances FOR SELECT TO authenticated
  USING (profile_id = public.current_profile_id() OR public.ugc_can_moderate());
CREATE POLICY ugc_blocks_own_select
  ON public.ugc_blocks FOR SELECT TO authenticated
  USING (blocker_profile_id = public.current_profile_id() OR public.ugc_can_moderate());
CREATE POLICY ugc_reports_own_or_admin_select
  ON public.ugc_reports FOR SELECT TO authenticated
  USING (reporter_profile_id = public.current_profile_id() OR public.ugc_can_moderate());
CREATE POLICY ugc_actions_subject_or_admin_select
  ON public.ugc_moderation_actions FOR SELECT TO authenticated
  USING (subject_profile_id = public.current_profile_id() OR public.ugc_can_moderate());
CREATE POLICY ugc_appeals_own_or_admin_select
  ON public.ugc_appeals FOR SELECT TO authenticated
  USING (appellant_profile_id = public.current_profile_id() OR public.ugc_can_moderate());

-- Add content metadata before compiling RPCs that use the tables' row types.
ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS moderation_reason text;
ALTER TABLE public.partner_posts
  ADD COLUMN IF NOT EXISTS author_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS moderation_reason text;

-- ---------------------------------------------------------------------------
-- 3. User-facing RPCs. Direct writes stay revoked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ugc_current_policy_version()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT '1.0.0'::text $$;

CREATE OR REPLACE FUNCTION public.ugc_has_current_policy()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ugc_policy_acceptances a
    WHERE a.profile_id = public.current_profile_id()
      AND a.policy_version = public.ugc_current_policy_version()
  )
$$;

CREATE OR REPLACE FUNCTION public.ugc_accept_policy(_policy_version text)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_accepted_at timestamptz;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF _policy_version IS DISTINCT FROM public.ugc_current_policy_version() THEN
    RAISE EXCEPTION 'community policy version is no longer current';
  END IF;

  INSERT INTO public.ugc_policy_acceptances(profile_id, policy_version)
  VALUES (v_profile_id, _policy_version)
  ON CONFLICT (profile_id, policy_version)
  DO UPDATE SET policy_version = EXCLUDED.policy_version
  RETURNING accepted_at INTO v_accepted_at;

  RETURN v_accepted_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.ugc_current_user_blocks_profile(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1 FROM public.ugc_blocks b
    WHERE b.blocker_profile_id = public.current_profile_id()
      AND b.blocked_profile_id = _profile_id
  ) END
$$;

CREATE OR REPLACE FUNCTION public.ugc_profiles_block_each_other(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1 FROM public.ugc_blocks b
    WHERE b.blocked_profile_id IS NOT NULL
      AND (
        (b.blocker_profile_id = public.current_profile_id() AND b.blocked_profile_id = _profile_id)
        OR
        (b.blocker_profile_id = _profile_id AND b.blocked_profile_id = public.current_profile_id())
      )
  ) END
$$;

CREATE OR REPLACE FUNCTION public.ugc_current_user_blocks_partner(_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1 FROM public.ugc_blocks b
    WHERE b.blocker_profile_id = public.current_profile_id()
      AND b.blocked_partner_id = _partner_id
  ) END
$$;

CREATE OR REPLACE FUNCTION public.ugc_current_user_blocks_whatsapp_group(_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1 FROM public.ugc_blocks b
    WHERE b.blocker_profile_id = public.current_profile_id()
      AND b.blocked_whatsapp_group_id = _group_id
  ) END
$$;

CREATE OR REPLACE FUNCTION public.ugc_current_user_blocks_coach(_coach_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE WHEN auth.uid() IS NULL THEN false ELSE EXISTS (
    SELECT 1
    FROM public.coaches c
    JOIN public.ugc_blocks b ON b.blocked_profile_id = c.profile_id
    WHERE c.id = _coach_id
      AND b.blocker_profile_id = public.current_profile_id()
  ) END
$$;

CREATE OR REPLACE FUNCTION public.ugc_review_product_is_public(
  _product_origin text,
  _product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE _product_origin
    WHEN 'fitmind' THEN
      EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = _product_id
          AND (p.status = 'active' OR COALESCE(p.is_active, false))
      )
      OR EXISTS (
        SELECT 1 FROM public.store_products sp
        WHERE sp.id = _product_id AND sp.status = 'active'
      )
    WHEN 'course' THEN EXISTS (
      SELECT 1 FROM public.digital_products dp
      WHERE dp.id = _product_id AND dp.status = 'active'
    )
    WHEN 'partner' THEN EXISTS (
      SELECT 1
      FROM public.partner_products pp
      JOIN public.partners pa ON pa.id = pp.partner_id
      WHERE pp.id = _product_id
        AND pp.status = 'approved'
        AND pp.is_active_by_partner
        AND pp.is_ready_for_sale
        AND pp.deleted_at IS NULL
        AND pa.status = 'approved'
        AND pa.blocked_at IS NULL
    )
    WHEN 'professional' THEN EXISTS (
      SELECT 1
      FROM public.professional_products fp
      JOIN public.coaches c ON c.id = fp.coach_id
      JOIN public.profiles pr ON pr.id = c.profile_id
      WHERE fp.id = _product_id
        AND fp.status = 'approved'
        AND fp.is_active_by_professional
        AND fp.is_ready_for_sale
        AND COALESCE(pr.status, 'active') = 'active'
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.ugc_current_user_blocks_review_product(
  _product_origin text,
  _product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE _product_origin
    WHEN 'partner' THEN EXISTS (
      SELECT 1 FROM public.partner_products pp
      WHERE pp.id = _product_id
        AND public.ugc_current_user_blocks_partner(pp.partner_id)
    )
    WHEN 'professional' THEN EXISTS (
      SELECT 1 FROM public.professional_products fp
      WHERE fp.id = _product_id
        AND public.ugc_current_user_blocks_coach(fp.coach_id)
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.ugc_review_seller_profile(
  _product_origin text,
  _product_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE _product_origin
    WHEN 'partner' THEN (
      SELECT pa.profile_id
      FROM public.partner_products pp
      JOIN public.partners pa ON pa.id = pp.partner_id
      WHERE pp.id = _product_id
    )
    WHEN 'professional' THEN (
      SELECT c.profile_id
      FROM public.professional_products fp
      JOIN public.coaches c ON c.id = fp.coach_id
      WHERE fp.id = _product_id
    )
    ELSE NULL::uuid
  END
$$;

CREATE OR REPLACE FUNCTION public.ugc_review_seller_partner(
  _product_origin text,
  _product_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT CASE WHEN _product_origin = 'partner' THEN (
    SELECT pp.partner_id FROM public.partner_products pp WHERE pp.id = _product_id
  ) ELSE NULL::uuid END
$$;

CREATE OR REPLACE FUNCTION public.ugc_review_seller_can_manage(
  _product_origin text,
  _product_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT public.is_admin(auth.uid()) OR CASE _product_origin
    WHEN 'partner' THEN EXISTS (
      SELECT 1 FROM public.partner_products pp
      WHERE pp.id = _product_id
        AND public.partner_pode(pp.partner_id, 'products.editar')
    )
    WHEN 'professional' THEN EXISTS (
      SELECT 1
      FROM public.professional_products fp
      JOIN public.coaches c ON c.id = fp.coach_id
      WHERE fp.id = _product_id
        AND c.profile_id = public.current_profile_id()
    )
    ELSE false
  END
$$;

CREATE OR REPLACE FUNCTION public.ugc_profile_can_post(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _profile_id
      AND COALESCE(p.status, 'active') NOT IN ('blocked', 'deleted', 'suspended')
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.ugc_moderation_actions a
    WHERE a.subject_profile_id = _profile_id
      AND a.action_type = 'suspend_posting'
      AND a.revoked_at IS NULL
      AND (a.expires_at IS NULL OR a.expires_at > now())
  )
$$;

CREATE OR REPLACE FUNCTION public.ugc_set_block(
  _target_kind text,
  _target_id uuid,
  _blocked boolean DEFAULT true
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_review public.product_reviews%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF _target_id IS NULL OR _target_kind NOT IN (
    'profile', 'partner', 'whatsapp_group', 'product_review', 'product_review_reply'
  ) THEN
    RAISE EXCEPTION 'invalid block target';
  END IF;

  -- Content-derived block targets keep profile/partner UUIDs out of the
  -- public review RPC. The server resolves the author or seller internally.
  IF _target_kind IN ('product_review', 'product_review_reply') THEN
    SELECT * INTO v_review
    FROM public.product_reviews r
    WHERE r.id = _target_id
      AND r.hidden_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'review is not available'; END IF;

    IF _target_kind = 'product_review' THEN
      _target_kind := 'profile';
      _target_id := v_review.author_id;
    ELSE
      IF NULLIF(btrim(v_review.seller_reply), '') IS NULL THEN
        RAISE EXCEPTION 'seller reply is not available';
      END IF;
      IF v_review.product_origin = 'partner' THEN
        _target_kind := 'partner';
        _target_id := public.ugc_review_seller_partner(
          v_review.product_origin, v_review.product_id
        );
      ELSIF v_review.product_origin = 'professional' THEN
        _target_kind := 'profile';
        _target_id := public.ugc_review_seller_profile(
          v_review.product_origin, v_review.product_id
        );
      ELSE
        RAISE EXCEPTION 'seller cannot be blocked for this review';
      END IF;
    END IF;
  END IF;

  IF _target_kind = 'profile' THEN
    IF _target_id = v_profile_id OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _target_id) THEN
      RAISE EXCEPTION 'invalid profile block target';
    END IF;
    IF _blocked THEN
      INSERT INTO public.ugc_blocks(blocker_profile_id, blocked_profile_id)
      VALUES (v_profile_id, _target_id) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.ugc_blocks
      WHERE blocker_profile_id = v_profile_id AND blocked_profile_id = _target_id;
    END IF;
  ELSIF _target_kind = 'partner' THEN
    IF NOT EXISTS (SELECT 1 FROM public.partners WHERE id = _target_id)
       OR public.partner_pode(_target_id, 'profile.editar') THEN
      RAISE EXCEPTION 'invalid partner block target';
    END IF;
    IF _blocked THEN
      INSERT INTO public.ugc_blocks(blocker_profile_id, blocked_partner_id)
      VALUES (v_profile_id, _target_id) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.ugc_blocks
      WHERE blocker_profile_id = v_profile_id AND blocked_partner_id = _target_id;
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.whatsapp_groups WHERE id = _target_id) THEN
      RAISE EXCEPTION 'invalid WhatsApp group block target';
    END IF;
    IF _blocked THEN
      INSERT INTO public.ugc_blocks(blocker_profile_id, blocked_whatsapp_group_id)
      VALUES (v_profile_id, _target_id) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.ugc_blocks
      WHERE blocker_profile_id = v_profile_id AND blocked_whatsapp_group_id = _target_id;
    END IF;
  END IF;

  RETURN _blocked;
END;
$$;

CREATE OR REPLACE FUNCTION public.ugc_group_public_profiles(_group_id uuid)
RETURNS TABLE (id uuid, name text, photo_url text, role text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.is_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = _group_id
      AND gm.profile_id = public.current_profile_id()
      AND COALESCE(gm.is_banned, false) = false
  ) THEN
    RAISE EXCEPTION 'group membership required';
  END IF;

  RETURN QUERY
  SELECT p.id, p.name::text, COALESCE(p.photo_url, p.avatar_url)::text, p.role::text
  FROM public.group_members gm
  JOIN public.profiles p ON p.id = gm.profile_id
  WHERE gm.group_id = _group_id
    AND COALESCE(gm.is_banned, false) = false
    AND NOT public.ugc_profiles_block_each_other(p.id);
END;
$$;

-- Rebuild the purchase guard from main. Ownership alone is insufficient: the
-- order must be paid and the exact product/origin must belong to that order.
CREATE OR REPLACE FUNCTION public.avaliacao_exige_compra_propria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR public.current_profile_id() IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NEW.author_id IS DISTINCT FROM public.current_profile_id() THEN
    RAISE EXCEPTION 'Esta compra nao e sua: so quem comprou avalia.';
  END IF;

  IF NEW.order_type = 'transaction' THEN
    SELECT s.profile_id INTO v_owner
    FROM public.transactions t
    JOIN public.students s ON s.id = t.student_id
    WHERE t.id = NEW.order_id
      AND t.status = 'paid'
      AND NULLIF(t.metadata->>'store_order_id', '') IS NULL
      AND (
        (NEW.product_origin = 'course' AND t.digital_product_id = NEW.product_id)
        OR
        (NEW.product_origin = 'fitmind' AND (
          t.store_product_id = NEW.product_id
          OR (
            t.store_product_id IS NULL
            AND t.digital_product_id IS NULL
            AND t.product_id = NEW.product_id
          )
        ))
      );
  ELSIF NEW.order_type = 'store_order' THEN
    SELECT s.profile_id INTO v_owner
    FROM public.store_orders o
    JOIN public.students s ON s.id = o.student_id
    WHERE o.id = NEW.order_id
      -- O pedido continua pago enquanto avança na logística. Sem estes
      -- estados, justamente a compra entregue seria recusada pelo gatilho.
      AND o.status IN ('paid', 'preparing', 'shipped', 'delivered')
      AND EXISTS (
        SELECT 1 FROM public.store_order_items i
        WHERE i.order_id = o.id
          AND (
            (NEW.product_origin = 'course' AND i.digital_product_id = NEW.product_id)
            OR
            (NEW.product_origin = 'fitmind' AND (
              i.product_id = NEW.product_id OR i.store_product_id = NEW.product_id
            ))
          )
      );
  ELSIF NEW.order_type = 'partner_product_order' THEN
    SELECT s.profile_id INTO v_owner
    FROM public.partner_product_orders o
    JOIN public.students s ON s.id = o.student_id
    WHERE o.id = NEW.order_id
      AND o.status = 'paid'
      AND (
        (NEW.product_origin = 'partner' AND o.partner_product_id = NEW.product_id)
        OR
        (NEW.product_origin = 'professional' AND o.professional_product_id = NEW.product_id)
      );
  ELSE
    RAISE EXCEPTION 'Tipo de pedido invalido para avaliacao.';
  END IF;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'Pedido pago e produto correspondente nao encontrados.';
  END IF;
  IF v_owner IS DISTINCT FROM NEW.author_id THEN
    RAISE EXCEPTION 'Esta compra nao e sua: so quem comprou avalia.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_reviews_exige_compra ON public.product_reviews;
CREATE TRIGGER product_reviews_exige_compra
  BEFORE INSERT OR UPDATE OF order_id, order_type, author_id, product_origin, product_id
  ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.avaliacao_exige_compra_propria();

CREATE OR REPLACE FUNCTION public.avaliar_produto(
  _review_id uuid,
  _product_origin text,
  _product_id uuid,
  _order_id uuid,
  _order_type text,
  _rating integer,
  _comment text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_author uuid := public.current_profile_id();
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_author IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.ugc_has_current_policy() THEN RAISE EXCEPTION 'community policy acceptance required'; END IF;
  IF NOT public.ugc_profile_can_post(v_author) THEN RAISE EXCEPTION 'posting is suspended'; END IF;
  IF _product_origin NOT IN ('fitmind', 'partner', 'professional', 'course') THEN
    RAISE EXCEPTION 'invalid product origin';
  END IF;
  IF _order_type NOT IN ('transaction', 'store_order', 'partner_product_order') THEN
    RAISE EXCEPTION 'invalid order type';
  END IF;
  IF _rating NOT BETWEEN 1 AND 5 THEN RAISE EXCEPTION 'rating must be between 1 and 5'; END IF;
  _comment := NULLIF(btrim(_comment), '');
  IF _comment IS NOT NULL AND char_length(_comment) > 2000 THEN
    RAISE EXCEPTION 'review comment is too long';
  END IF;

  IF _review_id IS NULL THEN
    INSERT INTO public.product_reviews(
      product_origin, product_id, order_id, order_type, author_id, rating, comment
    ) VALUES (
      _product_origin, _product_id, _order_id, _order_type, v_author, _rating::smallint, _comment
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.product_reviews r
    SET rating = _rating::smallint, comment = _comment, updated_at = now()
    WHERE r.id = _review_id
      AND r.author_id = v_author
      AND r.product_origin = _product_origin
      AND r.product_id = _product_id
      AND r.order_id = _order_id
      AND r.order_type = _order_type
      AND r.hidden_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.ugc_reports report
        WHERE report.target_kind = 'product_review'
          AND report.target_id = r.id
          AND report.status IN ('open', 'reviewing')
      )
    RETURNING r.id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'review is not editable by this account'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.minhas_avaliacoes()
RETURNS TABLE (
  id uuid,
  product_origin text,
  product_id uuid,
  order_id uuid,
  order_type text,
  rating smallint,
  comment text,
  seller_reply text,
  seller_replied_at timestamptz,
  created_at timestamptz,
  hidden_at timestamptz,
  hidden_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE v_profile_id uuid := public.current_profile_id();
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  RETURN QUERY
  SELECT r.id, r.product_origin, r.product_id, r.order_id, r.order_type,
         r.rating, r.comment, r.seller_reply, r.seller_replied_at,
         r.created_at, r.hidden_at, r.hidden_reason
  FROM public.product_reviews r
  WHERE r.author_id = v_profile_id
  ORDER BY r.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.resumo_avaliacoes(_product_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  product_origin text,
  product_id uuid,
  total integer,
  media numeric,
  positivas integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  RETURN QUERY
  SELECT r.product_origin,
         r.product_id,
         count(*)::integer,
         round(avg(r.rating)::numeric, 2),
         count(*) FILTER (WHERE r.rating >= 4)::integer
  FROM public.product_reviews r
  WHERE r.hidden_at IS NULL
    AND (_product_ids IS NULL OR r.product_id = ANY(_product_ids))
    AND public.ugc_review_product_is_public(r.product_origin, r.product_id)
    AND NOT public.ugc_profiles_block_each_other(r.author_id)
    AND NOT public.ugc_current_user_blocks_review_product(r.product_origin, r.product_id)
  GROUP BY r.product_origin, r.product_id
  ORDER BY r.product_origin, r.product_id
  LIMIT 5000;
END;
$$;

DROP FUNCTION IF EXISTS public.avaliacoes_do_produto(text, uuid, integer);
CREATE FUNCTION public.avaliacoes_do_produto(
  _origem text,
  _produto_id uuid,
  _limite integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  rating smallint,
  comment text,
  seller_reply text,
  seller_replied_at timestamptz,
  created_at timestamptz,
  autor text,
  can_report boolean,
  can_block_author boolean,
  can_block_seller boolean,
  can_report_seller_reply boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE v_profile_id uuid := public.current_profile_id();
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.ugc_review_product_is_public(_origem, _produto_id)
     OR public.ugc_current_user_blocks_review_product(_origem, _produto_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.id, r.rating, r.comment, r.seller_reply, r.seller_replied_at,
         r.created_at,
         CASE
           WHEN COALESCE(btrim(p.name), '') = '' THEN 'Cliente'
           WHEN position(' ' IN btrim(p.name)) = 0 THEN split_part(btrim(p.name), ' ', 1)
           ELSE split_part(btrim(p.name), ' ', 1) || ' ' ||
                left(split_part(btrim(p.name), ' ', 2), 1) || '.'
         END::text,
         (r.author_id <> v_profile_id),
         (r.author_id <> v_profile_id),
         (
           r.seller_reply IS NOT NULL
           AND r.product_origin IN ('partner', 'professional')
           AND NOT public.ugc_review_seller_can_manage(
             r.product_origin, r.product_id
           )
         ),
         (
           r.seller_reply IS NOT NULL
           AND COALESCE(
             r.seller_reply_by_profile_id,
             public.ugc_review_seller_profile(r.product_origin, r.product_id)
           ) IS DISTINCT FROM v_profile_id
         )
  FROM public.product_reviews r
  LEFT JOIN public.profiles p ON p.id = r.author_id
  WHERE r.product_origin = _origem
    AND r.product_id = _produto_id
    AND r.hidden_at IS NULL
    AND NOT public.ugc_profiles_block_each_other(r.author_id)
  ORDER BY r.created_at DESC
  LIMIT LEAST(100, GREATEST(1, COALESCE(_limite, 20)));
END;
$$;

-- Main already defines this signature returning void. PostgreSQL cannot change
-- a function return type through CREATE OR REPLACE, so remove that legacy
-- implementation before installing the moderated boolean-returning version.
DROP FUNCTION IF EXISTS public.responder_avaliacao(uuid, text);
CREATE FUNCTION public.responder_avaliacao(_id uuid, _resposta text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_review public.product_reviews%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  PERFORM pg_advisory_xact_lock(
    hashtextextended('ugc:review-reply:' || _id::text, 0)
  );
  SELECT * INTO v_review FROM public.product_reviews WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR v_review.hidden_at IS NOT NULL THEN RAISE EXCEPTION 'review is not available'; END IF;
  IF NOT public.ugc_review_seller_can_manage(v_review.product_origin, v_review.product_id) THEN
    RAISE EXCEPTION 'seller permission required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ugc_moderation_actions a
    WHERE a.action_type = 'hide_content'
      AND a.target_kind = 'product_review_reply'
      AND a.target_id = _id
      AND a.revoked_at IS NULL
      AND (a.expires_at IS NULL OR a.expires_at > now())
  ) THEN
    RAISE EXCEPTION 'seller reply is hidden by moderation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ugc_reports report
    WHERE report.target_kind = 'product_review_reply'
      AND report.target_id = _id
      AND report.status IN ('open', 'reviewing')
  ) THEN
    RAISE EXCEPTION 'seller reply has an open moderation report';
  END IF;
  _resposta := NULLIF(btrim(_resposta), '');
  IF _resposta IS NOT NULL THEN
    IF NOT public.ugc_has_current_policy() THEN RAISE EXCEPTION 'community policy acceptance required'; END IF;
    IF NOT public.ugc_profile_can_post(v_profile_id) THEN RAISE EXCEPTION 'posting is suspended'; END IF;
    IF char_length(_resposta) > 2000 THEN RAISE EXCEPTION 'seller reply is too long'; END IF;
  END IF;
  UPDATE public.product_reviews
  SET seller_reply = _resposta,
      seller_replied_at = CASE WHEN _resposta IS NULL THEN NULL ELSE now() END,
      seller_reply_by_profile_id = CASE WHEN _resposta IS NULL THEN NULL ELSE v_profile_id END,
      updated_at = now()
  WHERE id = _id;
  RETURN true;
END;
$$;

-- No client may read order identifiers or mutate moderation/seller fields
-- directly. Public list, private list, summaries and writes all use RPCs.
REVOKE ALL ON public.product_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.product_reviews TO service_role;
REVOKE ALL ON public.product_review_summary FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.product_review_summary TO service_role;

REVOKE ALL ON FUNCTION public.avaliacao_exige_compra_propria() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_review_product_is_public(text, uuid),
  public.ugc_current_user_blocks_review_product(text, uuid),
  public.ugc_review_seller_profile(text, uuid),
  public.ugc_review_seller_partner(text, uuid),
  public.ugc_review_seller_can_manage(text, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.avaliar_produto(uuid, text, uuid, uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.minhas_avaliacoes() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resumo_avaliacoes(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.avaliacoes_do_produto(text, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.responder_avaliacao(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avaliar_produto(uuid, text, uuid, uuid, text, integer, text),
  public.minhas_avaliacoes(), public.resumo_avaliacoes(uuid[]),
  public.avaliacoes_do_produto(text, uuid, integer),
  public.responder_avaliacao(uuid, text)
TO authenticated, service_role;

-- Legacy review administration from main may read the queue and let sellers
-- answer, but it must not bypass the report/action/appeal audit trail by
-- hiding or republishing content directly.
REVOKE ALL ON FUNCTION public.avaliacoes_para_moderar(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avaliacoes_para_moderar(boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.avaliacoes_dos_meus_produtos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.avaliacoes_dos_meus_produtos() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.moderar_avaliacao(uuid, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.moderar_avaliacao(uuid, boolean, text) TO service_role;

CREATE OR REPLACE FUNCTION public.ugc_report(
  _target_kind text,
  _target_id uuid,
  _reason_code text,
  _details text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_reporter uuid := public.current_profile_id();
  v_report_id uuid;
  v_subject_profile uuid;
  v_subject_partner uuid;
  v_group_id uuid;
  v_snapshot jsonb := '{}'::jsonb;
  v_message public.group_messages%ROWTYPE;
  v_post public.partner_posts%ROWTYPE;
  v_review public.product_reviews%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_partner public.partners%ROWTYPE;
  v_whatsapp public.whatsapp_groups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_reporter IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF _target_kind NOT IN (
    'group_message', 'partner_post', 'product_review', 'product_review_reply',
    'profile', 'partner', 'whatsapp_group'
  ) THEN
    RAISE EXCEPTION 'invalid report target';
  END IF;
  IF _reason_code NOT IN (
    'sexual_content', 'harassment', 'hate', 'violence', 'dangerous',
    'spam', 'impersonation', 'privacy', 'self_harm', 'illegal', 'other'
  ) THEN
    RAISE EXCEPTION 'invalid report reason';
  END IF;
  _details := NULLIF(btrim(_details), '');
  IF _details IS NOT NULL AND char_length(_details) > 2000 THEN
    RAISE EXCEPTION 'report details are too long';
  END IF;
  IF (SELECT count(*) FROM public.ugc_reports
      WHERE reporter_profile_id = v_reporter AND created_at > now() - interval '24 hours') >= 20 THEN
    RAISE EXCEPTION 'daily report limit reached';
  END IF;

  SELECT id INTO v_report_id FROM public.ugc_reports
  WHERE reporter_profile_id = v_reporter
    AND target_kind = _target_kind
    AND target_id = _target_id
    AND status IN ('open', 'reviewing')
  LIMIT 1;
  IF v_report_id IS NOT NULL THEN RETURN v_report_id; END IF;

  IF _target_kind = 'group_message' THEN
    SELECT * INTO v_message FROM public.group_messages WHERE id = _target_id;
    IF NOT FOUND
       OR COALESCE(v_message.is_deleted, false)
       OR v_message.moderation_status <> 'visible'
       OR NOT EXISTS (
      SELECT 1 FROM public.group_members gm
      WHERE gm.group_id = v_message.group_id
        AND gm.profile_id = v_reporter
        AND COALESCE(gm.is_banned, false) = false
    ) THEN RAISE EXCEPTION 'report target is not visible'; END IF;
    IF v_message.sender_profile_id = v_reporter THEN RAISE EXCEPTION 'cannot report own content'; END IF;
    v_subject_profile := v_message.sender_profile_id;
    v_group_id := v_message.group_id;
    v_snapshot := jsonb_build_object(
      'content', v_message.content, 'media_path', v_message.media_url,
      'media_type', v_message.media_type, 'created_at', v_message.created_at,
      'group_id', v_message.group_id, 'sender_profile_id', v_message.sender_profile_id
    );
  ELSIF _target_kind = 'partner_post' THEN
    SELECT * INTO v_post FROM public.partner_posts WHERE id = _target_id FOR SHARE;
    IF NOT FOUND
       OR v_post.moderation_status <> 'visible'
       OR NOT EXISTS (
         SELECT 1 FROM public.partners visible_partner
         WHERE visible_partner.id = v_post.partner_id
           AND visible_partner.status = 'approved'
       ) THEN
      RAISE EXCEPTION 'report target is not visible';
    END IF;
    SELECT profile_id INTO v_subject_profile FROM public.partners WHERE id = v_post.partner_id;
    v_subject_profile := COALESCE(v_post.author_profile_id, v_subject_profile);
    v_subject_partner := v_post.partner_id;
    IF v_subject_profile = v_reporter OR public.partner_pode(v_post.partner_id, 'timeline.editar') THEN
      RAISE EXCEPTION 'cannot report own content';
    END IF;
    v_snapshot := jsonb_build_object(
      'caption', v_post.caption, 'image_url', v_post.image_url,
      'created_at', v_post.created_at, 'partner_id', v_post.partner_id,
      'author_profile_id', v_post.author_profile_id
    );
  ELSIF _target_kind IN ('product_review', 'product_review_reply') THEN
    SELECT * INTO v_review
    FROM public.product_reviews
    WHERE id = _target_id
    FOR SHARE;
    IF NOT FOUND
       OR v_review.hidden_at IS NOT NULL
       OR NOT public.ugc_review_product_is_public(v_review.product_origin, v_review.product_id)
       OR public.ugc_current_user_blocks_review_product(v_review.product_origin, v_review.product_id) THEN
      RAISE EXCEPTION 'report target is not visible';
    END IF;

    IF _target_kind = 'product_review' THEN
      IF v_review.author_id = v_reporter
         OR public.ugc_profiles_block_each_other(v_review.author_id) THEN
        RAISE EXCEPTION 'cannot report own or unavailable content';
      END IF;
      v_subject_profile := v_review.author_id;
      v_snapshot := jsonb_build_object(
        'review_id', v_review.id,
        'product_origin', v_review.product_origin,
        'product_id', v_review.product_id,
        'rating', v_review.rating,
        'comment', v_review.comment,
        'author_id', v_review.author_id,
        'created_at', v_review.created_at
      );
    ELSE
      IF NULLIF(btrim(v_review.seller_reply), '') IS NULL THEN
        RAISE EXCEPTION 'seller reply is not visible';
      END IF;
      v_subject_profile := COALESCE(
        v_review.seller_reply_by_profile_id,
        public.ugc_review_seller_profile(v_review.product_origin, v_review.product_id)
      );
      v_subject_partner := public.ugc_review_seller_partner(
        v_review.product_origin, v_review.product_id
      );
      IF v_subject_profile = v_reporter THEN
        RAISE EXCEPTION 'cannot report own content';
      END IF;
      v_snapshot := jsonb_build_object(
        'review_id', v_review.id,
        'product_origin', v_review.product_origin,
        'product_id', v_review.product_id,
        'seller_reply', v_review.seller_reply,
        'seller_replied_at', v_review.seller_replied_at,
        'seller_reply_by_profile_id', v_review.seller_reply_by_profile_id
      );
    END IF;
  ELSIF _target_kind = 'profile' THEN
    SELECT * INTO v_profile FROM public.profiles WHERE id = _target_id;
    IF NOT FOUND OR v_profile.id = v_reporter OR NOT (
      EXISTS (
        SELECT 1 FROM public.coaches visible_coach
        WHERE visible_coach.profile_id = v_profile.id
          AND (visible_coach.approved_at IS NOT NULL OR visible_coach.is_professional = true)
      )
      OR EXISTS (
        SELECT 1
        FROM public.group_members reporter_member
        JOIN public.group_members subject_member
          ON subject_member.group_id = reporter_member.group_id
        JOIN public.challenge_groups visible_group
          ON visible_group.id = reporter_member.group_id
        WHERE reporter_member.profile_id = v_reporter
          AND subject_member.profile_id = v_profile.id
          AND COALESCE(reporter_member.is_banned, false) = false
          AND COALESCE(subject_member.is_banned, false) = false
          AND COALESCE(visible_group.is_active, false) = true
      )
    ) THEN RAISE EXCEPTION 'invalid profile report target'; END IF;
    v_subject_profile := v_profile.id;
    v_snapshot := jsonb_build_object(
      'name', v_profile.name, 'photo_url', COALESCE(v_profile.photo_url, v_profile.avatar_url),
      'bio', v_profile.bio, 'role', v_profile.role
    ) || COALESCE((
      SELECT jsonb_build_object(
        'headline', pp.headline, 'bio_long', pp.bio_long,
        'services', pp.services, 'instagram', pp.instagram,
        'website', pp.website, 'social_links', pp.social_links
      )
      FROM public.professional_public_profile pp
      WHERE pp.profile_id = v_profile.id
    ), '{}'::jsonb);
  ELSIF _target_kind = 'partner' THEN
    SELECT * INTO v_partner FROM public.partners WHERE id = _target_id;
    IF NOT FOUND OR v_partner.status <> 'approved'
       OR public.partner_pode(v_partner.id, 'profile.editar') THEN
      RAISE EXCEPTION 'invalid partner report target';
    END IF;
    v_subject_profile := v_partner.profile_id;
    v_subject_partner := v_partner.id;
    v_snapshot := jsonb_build_object(
      'fantasy_name', v_partner.fantasy_name, 'description', v_partner.description,
      'photo_url', v_partner.photo_url, 'cover_url', v_partner.cover_url,
      'city', v_partner.city, 'state', v_partner.state
    );
  ELSE
    SELECT * INTO v_whatsapp FROM public.whatsapp_groups WHERE id = _target_id;
    IF NOT FOUND OR COALESCE(v_whatsapp.is_active, false) = false THEN
      RAISE EXCEPTION 'invalid WhatsApp group report target';
    END IF;
    IF v_whatsapp.owner_partner_id IS NOT NULL THEN
      v_subject_partner := v_whatsapp.owner_partner_id;
      SELECT profile_id INTO v_subject_profile FROM public.partners WHERE id = v_subject_partner;
    ELSE
      SELECT profile_id INTO v_subject_profile FROM public.coaches WHERE id = v_whatsapp.owner_coach_id;
    END IF;
    IF v_subject_profile = v_reporter THEN RAISE EXCEPTION 'cannot report own content'; END IF;
    v_snapshot := jsonb_build_object(
      'name', v_whatsapp.name, 'description', v_whatsapp.description,
      'invite_url', v_whatsapp.invite_url, 'phone', v_whatsapp.phone,
      'owner_kind', v_whatsapp.owner_kind
    );
  END IF;

  INSERT INTO public.ugc_reports(
    reporter_profile_id, target_kind, target_id, subject_profile_id,
    subject_partner_id, group_id, reason_code, details, evidence_snapshot
  ) VALUES (
    v_reporter, _target_kind, _target_id, v_subject_profile,
    v_subject_partner, v_group_id, _reason_code, _details, v_snapshot
  )
  ON CONFLICT (reporter_profile_id, target_kind, target_id)
    WHERE reporter_profile_id IS NOT NULL AND status IN ('open', 'reviewing')
  DO NOTHING
  RETURNING id INTO v_report_id;

  -- Two simultaneous taps may race after the pre-check. The partial unique
  -- index keeps one open report and this lookup makes the RPC idempotent.
  IF v_report_id IS NULL THEN
    SELECT r.id INTO v_report_id
    FROM public.ugc_reports r
    WHERE r.reporter_profile_id = v_reporter
      AND r.target_kind = _target_kind
      AND r.target_id = _target_id
      AND r.status IN ('open', 'reviewing')
    ORDER BY r.created_at DESC
    LIMIT 1;
  END IF;

  IF v_report_id IS NULL THEN
    RAISE EXCEPTION 'report could not be recorded';
  END IF;

  RETURN v_report_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Content state and immutable-author enforcement.
-- ---------------------------------------------------------------------------
ALTER TABLE public.group_messages
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS moderation_reason text;
ALTER TABLE public.group_messages DROP CONSTRAINT IF EXISTS group_messages_moderation_status_ck;
ALTER TABLE public.group_messages ADD CONSTRAINT group_messages_moderation_status_ck
  CHECK (moderation_status IN ('visible', 'hidden', 'removed'));

ALTER TABLE public.partner_posts
  ADD COLUMN IF NOT EXISTS author_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS moderation_status text NOT NULL DEFAULT 'visible',
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS moderation_reason text;
ALTER TABLE public.partner_posts DROP CONSTRAINT IF EXISTS partner_posts_moderation_status_ck;
ALTER TABLE public.partner_posts ADD CONSTRAINT partner_posts_moderation_status_ck
  CHECK (moderation_status IN ('visible', 'hidden', 'removed'));

UPDATE public.partner_posts pp
SET author_profile_id = pt.profile_id
FROM public.partners pt
WHERE pt.id = pp.partner_id AND pp.author_profile_id IS NULL;

CREATE INDEX IF NOT EXISTS group_messages_visible_idx
  ON public.group_messages(group_id, created_at DESC)
  WHERE moderation_status = 'visible';
CREATE INDEX IF NOT EXISTS partner_posts_visible_idx
  ON public.partner_posts(partner_id, created_at DESC)
  WHERE moderation_status = 'visible';

CREATE OR REPLACE FUNCTION public.ugc_guard_group_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_member public.group_members%ROWTYPE;
  v_permission public.chat_permission;
BEGIN
  IF public.is_admin(auth.uid()) OR auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.sender_profile_id <> v_profile_id
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.sender_profile_id IS DISTINCT FROM OLD.sender_profile_id
       OR NEW.reply_to_id IS DISTINCT FROM OLD.reply_to_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
       OR NEW.moderated_at IS DISTINCT FROM OLD.moderated_at
       OR NEW.moderated_by_profile_id IS DISTINCT FROM OLD.moderated_by_profile_id
       OR NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason
       OR COALESCE(OLD.is_deleted, false)
       OR COALESCE(NEW.is_deleted, false) = false THEN
      RAISE EXCEPTION 'only soft deletion of an own message is allowed';
    END IF;
    NEW.content := NULL;
    NEW.media_url := NULL;
    NEW.media_type := NULL;
    NEW.deleted_by := v_profile_id;
    RETURN NEW;
  END IF;

  IF NEW.sender_profile_id IS DISTINCT FROM v_profile_id THEN RAISE EXCEPTION 'invalid message sender'; END IF;
  IF NOT public.ugc_has_current_policy() THEN RAISE EXCEPTION 'accept community guidelines before posting'; END IF;
  IF NOT public.ugc_profile_can_post(v_profile_id) THEN RAISE EXCEPTION 'posting is suspended'; END IF;

  SELECT gm.* INTO v_member
  FROM public.group_members gm
  WHERE gm.group_id = NEW.group_id AND gm.profile_id = v_profile_id;
  IF NOT FOUND OR COALESCE(v_member.is_banned, false)
     OR COALESCE(v_member.is_muted, false)
     OR (v_member.muted_until IS NOT NULL AND v_member.muted_until > now()) THEN
    RAISE EXCEPTION 'group posting is not allowed';
  END IF;

  SELECT send_permission INTO v_permission
  FROM public.challenge_groups
  WHERE id = NEW.group_id AND COALESCE(is_active, false) = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'group is not active'; END IF;
  IF NOT (
    v_permission = 'all_members'
    OR (v_permission = 'coaches_only' AND v_member.role IN ('coach', 'manager', 'admin'))
    OR (v_permission = 'managers_only' AND v_member.role IN ('manager', 'admin'))
    OR (v_permission = 'admins_only' AND v_member.role = 'admin')
  ) THEN RAISE EXCEPTION 'group sending permission denied'; END IF;

  NEW.content := NULLIF(btrim(NEW.content), '');
  IF NEW.content IS NULL AND NEW.media_url IS NULL THEN RAISE EXCEPTION 'message cannot be empty'; END IF;
  IF NEW.content IS NOT NULL AND char_length(NEW.content) > 2000 THEN RAISE EXCEPTION 'message is too long'; END IF;
  IF NEW.media_url IS NOT NULL AND (
    NEW.media_type IS DISTINCT FROM 'image'
    OR NEW.media_url LIKE '%://%'
    OR NEW.media_url NOT LIKE NEW.group_id::text || '/' || v_profile_id::text || '/%'
  ) THEN RAISE EXCEPTION 'invalid group media path'; END IF;
  IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.group_messages parent
    WHERE parent.id = NEW.reply_to_id AND parent.group_id = NEW.group_id
  ) THEN RAISE EXCEPTION 'reply target must belong to the same group'; END IF;

  NEW.is_deleted := false;
  NEW.deleted_by := NULL;
  NEW.moderation_status := 'visible';
  NEW.moderated_at := NULL;
  NEW.moderated_by_profile_id := NULL;
  NEW.moderation_reason := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ugc_guard_group_message ON public.group_messages;
CREATE TRIGGER trg_ugc_guard_group_message
  BEFORE INSERT OR UPDATE ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.ugc_guard_group_message();

CREATE OR REPLACE FUNCTION public.ugc_guard_partner_post()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE v_profile_id uuid := public.current_profile_id();
BEGIN
  IF public.is_admin(auth.uid()) OR auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.partner_pode(NEW.partner_id, 'timeline.editar') THEN RAISE EXCEPTION 'partner permission denied'; END IF;
  IF NOT public.ugc_has_current_policy() THEN RAISE EXCEPTION 'accept community guidelines before posting'; END IF;
  IF NOT public.ugc_profile_can_post(v_profile_id) THEN RAISE EXCEPTION 'posting is suspended'; END IF;

  IF TG_OP = 'INSERT' THEN
    IF (SELECT count(*) FROM public.partner_posts pp
        WHERE pp.partner_id = NEW.partner_id AND pp.moderation_status <> 'removed') >= 30 THEN
      RAISE EXCEPTION 'partner timeline limit reached';
    END IF;
    NEW.author_profile_id := v_profile_id;
    NEW.moderation_status := 'visible';
    NEW.moderated_at := NULL;
    NEW.moderated_by_profile_id := NULL;
    NEW.moderation_reason := NULL;
  ELSE
    IF OLD.moderation_status <> 'visible'
       OR EXISTS (
         SELECT 1 FROM public.ugc_reports report
         WHERE report.target_kind = 'partner_post'
           AND report.target_id = OLD.id
           AND report.status IN ('open', 'reviewing')
       ) THEN
      RAISE EXCEPTION 'post under moderation review cannot be edited';
    END IF;
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.partner_id IS DISTINCT FROM OLD.partner_id
       OR NEW.author_profile_id IS DISTINCT FROM OLD.author_profile_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.moderation_status IS DISTINCT FROM OLD.moderation_status
       OR NEW.moderated_at IS DISTINCT FROM OLD.moderated_at
       OR NEW.moderated_by_profile_id IS DISTINCT FROM OLD.moderated_by_profile_id
       OR NEW.moderation_reason IS DISTINCT FROM OLD.moderation_reason THEN
      RAISE EXCEPTION 'protected partner post fields cannot be changed';
    END IF;
  END IF;

  NEW.caption := NULLIF(btrim(NEW.caption), '');
  IF NEW.caption IS NOT NULL AND char_length(NEW.caption) > 2000 THEN RAISE EXCEPTION 'caption is too long'; END IF;
  IF NEW.image_url IS NULL OR NEW.image_url !~ '^https://' THEN RAISE EXCEPTION 'invalid post image URL'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ugc_guard_partner_post ON public.partner_posts;
CREATE TRIGGER trg_ugc_guard_partner_post
  BEFORE INSERT OR UPDATE ON public.partner_posts
  FOR EACH ROW EXECUTE FUNCTION public.ugc_guard_partner_post();

CREATE OR REPLACE FUNCTION public.ugc_guard_professional_public_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF public.is_admin(auth.uid()) OR auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF auth.uid() IS NULL OR NEW.profile_id IS DISTINCT FROM public.current_profile_id() THEN
    RAISE EXCEPTION 'professional profile owner required';
  END IF;
  IF NOT public.ugc_has_current_policy() THEN RAISE EXCEPTION 'accept community guidelines before publishing'; END IF;
  IF NOT public.ugc_profile_can_post(NEW.profile_id) THEN RAISE EXCEPTION 'publishing is suspended'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ugc_guard_professional_public_profile ON public.professional_public_profile;
CREATE TRIGGER trg_ugc_guard_professional_public_profile
  BEFORE INSERT OR UPDATE ON public.professional_public_profile
  FOR EACH ROW EXECUTE FUNCTION public.ugc_guard_professional_public_profile();

CREATE OR REPLACE FUNCTION public.ugc_guard_professional_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF public.is_admin(auth.uid()) OR auth.role() = 'service_role' THEN RETURN NEW; END IF;
  IF NEW.id = public.current_profile_id()
     AND EXISTS (SELECT 1 FROM public.coaches c WHERE c.profile_id = NEW.id AND c.is_professional = true)
     AND (
       NEW.name IS DISTINCT FROM OLD.name
       OR NEW.avatar_url IS DISTINCT FROM OLD.avatar_url
       OR NEW.photo_url IS DISTINCT FROM OLD.photo_url
       OR NEW.bio IS DISTINCT FROM OLD.bio
       OR NEW.instagram IS DISTINCT FROM OLD.instagram
     ) THEN
    IF NOT public.ugc_has_current_policy() THEN RAISE EXCEPTION 'accept community guidelines before publishing'; END IF;
    IF NOT public.ugc_profile_can_post(NEW.id) THEN RAISE EXCEPTION 'publishing is suspended'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ugc_guard_professional_profile_fields ON public.profiles;
CREATE TRIGGER trg_ugc_guard_professional_profile_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ugc_guard_professional_profile_fields();

DROP POLICY IF EXISTS group_messages_member_select ON public.group_messages;
CREATE POLICY group_messages_member_select ON public.group_messages
  FOR SELECT TO authenticated
  USING (
    moderation_status = 'visible'
    AND EXISTS (
      SELECT 1 FROM public.group_members gm
      JOIN public.challenge_groups cg ON cg.id = gm.group_id
      WHERE gm.group_id = group_messages.group_id
        AND gm.profile_id = public.current_profile_id()
        AND COALESCE(gm.is_banned, false) = false
        AND COALESCE(cg.is_active, false) = true
    )
    AND NOT public.ugc_profiles_block_each_other(sender_profile_id)
  );

DROP POLICY IF EXISTS group_messages_member_insert ON public.group_messages;
CREATE POLICY group_messages_member_insert ON public.group_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_profile_id = public.current_profile_id()
    AND public.ugc_has_current_policy()
    AND public.ugc_profile_can_post(sender_profile_id)
  );

DROP POLICY IF EXISTS group_messages_sender_soft_delete ON public.group_messages;
CREATE POLICY group_messages_sender_soft_delete ON public.group_messages
  FOR UPDATE TO authenticated
  USING (sender_profile_id = public.current_profile_id())
  WITH CHECK (sender_profile_id = public.current_profile_id());
REVOKE DELETE ON public.group_messages FROM authenticated;

DROP POLICY IF EXISTS partner_posts_public_select ON public.partner_posts;
CREATE POLICY partner_posts_public_select ON public.partner_posts
  FOR SELECT TO anon, authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.partner_pode(partner_id, 'timeline.editar')
    OR (
      moderation_status = 'visible'
      AND EXISTS (
        SELECT 1 FROM public.partners pt
        WHERE pt.id = partner_posts.partner_id AND pt.status = 'approved'
      )
      AND NOT public.ugc_current_user_blocks_partner(partner_id)
    )
  );

DROP POLICY IF EXISTS partner_posts_owner_cud ON public.partner_posts;
CREATE POLICY partner_posts_owner_insert ON public.partner_posts
  FOR INSERT TO authenticated
  WITH CHECK (public.partner_pode(partner_id, 'timeline.editar'));
CREATE POLICY partner_posts_owner_update ON public.partner_posts
  FOR UPDATE TO authenticated
  USING (public.partner_pode(partner_id, 'timeline.editar'))
  WITH CHECK (public.partner_pode(partner_id, 'timeline.editar'));
CREATE POLICY partner_posts_owner_delete ON public.partner_posts
  FOR DELETE TO authenticated
  USING (public.partner_pode(partner_id, 'timeline.editar'));

-- A block must be effective on the server, including public professional
-- profiles and their catalog surfaces, not only hidden by React state.
CREATE POLICY profiles_ugc_block_restrictive
  ON public.profiles AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR id = public.current_profile_id()
    OR NOT public.ugc_current_user_blocks_profile(id)
  );
CREATE POLICY coaches_ugc_block_restrictive
  ON public.coaches AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR profile_id = public.current_profile_id()
    OR NOT public.ugc_current_user_blocks_profile(profile_id)
  );
CREATE POLICY professional_profile_ugc_block_restrictive
  ON public.professional_public_profile AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR profile_id = public.current_profile_id()
    OR NOT public.ugc_current_user_blocks_profile(profile_id)
  );
CREATE POLICY professional_products_ugc_block_restrictive
  ON public.professional_products AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR NOT public.ugc_current_user_blocks_coach(coach_id)
  );
CREATE POLICY partner_products_ugc_block_restrictive
  ON public.partner_products AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.partner_pode(partner_id, 'products.editar')
    OR NOT public.ugc_current_user_blocks_partner(partner_id)
  );
CREATE POLICY partners_ugc_block_restrictive
  ON public.partners AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.partner_pode(id, 'profile.editar')
    OR NOT public.ugc_current_user_blocks_partner(id)
  );

CREATE OR REPLACE FUNCTION public.parceiro_publico(p_partner_id uuid)
RETURNS TABLE (
  id uuid, fantasy_name text, description text, photo_url text, cover_url text,
  whatsapp text, public_whatsapp text, instagram text, facebook text, website text,
  address text, city text, state text, status text, business_area text, specialty text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT p.id, p.fantasy_name::text, p.description::text, p.photo_url::text,
         p.cover_url::text, p.whatsapp::text, p.public_whatsapp::text,
         p.instagram::text, p.facebook::text, p.website::text, p.address::text,
         p.city::text, p.state::text, p.status::text, p.business_area::text,
         p.specialty::text
  FROM public.partners p
  WHERE p.id = p_partner_id
    AND p.status = 'approved'
    AND (auth.uid() IS NULL OR NOT public.ugc_current_user_blocks_partner(p.id))
$$;
REVOKE ALL ON FUNCTION public.parceiro_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parceiro_publico(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.parceiros_publicos(_ids uuid[])
RETURNS TABLE (
  id uuid, fantasy_name text, photo_url text, city text, state text,
  status text, address text, business_area text, whatsapp text,
  public_whatsapp text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT p.id, p.fantasy_name::text, p.photo_url::text, p.city::text,
         p.state::text, p.status::text, p.address::text, p.business_area::text,
         p.whatsapp::text, p.public_whatsapp::text
  FROM public.partners p
  WHERE p.id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
    AND p.status = 'approved'
    AND (auth.uid() IS NULL OR NOT public.ugc_current_user_blocks_partner(p.id))
$$;
REVOKE ALL ON FUNCTION public.parceiros_publicos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parceiros_publicos(uuid[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.parceiros_publicos_loja(_ids uuid[])
RETURNS TABLE(id uuid, fantasy_name text, city text, upline_coach_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT p.id, p.fantasy_name::text, p.city::text, p.upline_coach_id
  FROM public.partners p
  WHERE p.id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
    AND p.status = 'approved'
    AND (auth.uid() IS NULL OR NOT public.ugc_current_user_blocks_partner(p.id))
$$;
REVOKE ALL ON FUNCTION public.parceiros_publicos_loja(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parceiros_publicos_loja(uuid[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.profissionais_publicos(_ids uuid[])
RETURNS TABLE(coach_id uuid, nome text, cidade text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  SELECT c.id, pr.name::text, pr.city::text
  FROM public.coaches c
  JOIN public.profiles pr ON pr.id = c.profile_id
  WHERE c.id = ANY(COALESCE(_ids, ARRAY[]::uuid[]))
    AND (auth.uid() IS NULL OR NOT public.ugc_current_user_blocks_coach(c.id))
$$;
REVOKE ALL ON FUNCTION public.profissionais_publicos(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.profissionais_publicos(uuid[]) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.vendedor_publico(_tipo text, _id uuid)
RETURNS TABLE (
  id uuid,
  tipo text,
  nome text,
  descricao text,
  foto text,
  capa text,
  cidade text,
  uf text,
  ramo text,
  especialidade text,
  instagram text,
  site text,
  desde timestamptz,
  aprovado boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF _tipo = 'partner' AND NOT public.ugc_current_user_blocks_partner(_id) THEN
    RETURN QUERY
    SELECT pa.id, 'partner'::text,
           COALESCE(NULLIF(btrim(pa.fantasy_name), ''), 'Parceiro')::text,
           pa.description, pa.photo_url, pa.cover_url, pa.city::text,
           pa.state::text, pa.business_area, pa.specialty, pa.instagram,
           pa.website, COALESCE(pa.approved_at, pa.created_at), true
    FROM public.partners pa
    WHERE pa.id = _id AND pa.status = 'approved' AND pa.blocked_at IS NULL;
  ELSIF _tipo = 'professional' AND NOT public.ugc_current_user_blocks_coach(_id) THEN
    RETURN QUERY
    SELECT c.id, 'professional'::text,
           COALESCE(NULLIF(btrim(pr.name), ''), 'Profissional')::text,
           NULL::text, pr.avatar_url, NULL::text, pr.city::text, pr.state::text,
           NULL::text, c.specialty_key::text, NULL::text, NULL::text,
           c.created_at, true
    FROM public.coaches c
    JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE c.id = _id AND COALESCE(pr.status, 'active') = 'active';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.reputacao_do_vendedor(_tipo text, _id uuid)
RETURNS TABLE (produtos integer, avaliacoes integer, nota numeric, vendas integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
  WITH allowed AS (
    SELECT auth.uid() IS NOT NULL AND CASE _tipo
      WHEN 'partner' THEN
        NOT public.ugc_current_user_blocks_partner(_id)
        AND EXISTS (
          SELECT 1 FROM public.partners pa
          WHERE pa.id = _id
            AND pa.status = 'approved'
            AND pa.blocked_at IS NULL
        )
      WHEN 'professional' THEN
        NOT public.ugc_current_user_blocks_coach(_id)
        AND EXISTS (
          SELECT 1
          FROM public.coaches c
          JOIN public.profiles pr ON pr.id = c.profile_id
          WHERE c.id = _id
            AND COALESCE(pr.status, 'active') = 'active'
        )
      ELSE false
    END AS ok
  ), ids(product_origin, id) AS (
    SELECT 'partner'::text, pp.id
    FROM public.partner_products pp, allowed a
    WHERE a.ok AND _tipo = 'partner' AND pp.partner_id = _id
      AND pp.status = 'approved' AND pp.is_active_by_partner
      AND pp.is_ready_for_sale AND pp.deleted_at IS NULL
    UNION ALL
    SELECT 'professional'::text, fp.id
    FROM public.professional_products fp, allowed a
    WHERE a.ok AND _tipo = 'professional' AND fp.coach_id = _id
      AND fp.status = 'approved' AND fp.is_active_by_professional
      AND fp.is_ready_for_sale
  ), visible_reviews AS (
    SELECT r.rating
    FROM public.product_reviews r
    JOIN ids i ON i.product_origin = r.product_origin AND i.id = r.product_id
    WHERE r.hidden_at IS NULL
      AND NOT public.ugc_profiles_block_each_other(r.author_id)
  )
  SELECT (SELECT count(*) FROM ids)::integer,
         (SELECT count(*) FROM visible_reviews)::integer,
         (SELECT round(avg(vr.rating)::numeric, 2) FROM visible_reviews vr),
         COALESCE((
           SELECT count(*) FROM public.partner_product_orders o
           WHERE o.status = 'paid'
             AND (
               o.partner_product_id IN (SELECT id FROM ids WHERE product_origin = 'partner')
               OR o.professional_product_id IN (SELECT id FROM ids WHERE product_origin = 'professional')
             )
         ), 0)::integer
  FROM allowed a
  WHERE a.ok;
$$;

REVOKE ALL ON FUNCTION public.vendedor_publico(text, uuid),
  public.reputacao_do_vendedor(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendedor_publico(text, uuid),
  public.reputacao_do_vendedor(text, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Admin moderation and appeal RPCs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_ugc_reports(
  _statuses text[] DEFAULT ARRAY['open', 'reviewing']::text[],
  _limit integer DEFAULT 200,
  _oldest_first boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  target_kind text,
  target_id uuid,
  reason_code text,
  details text,
  evidence_snapshot jsonb,
  status text,
  resolution text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
BEGIN
  IF NOT public.ugc_can_moderate() OR public.current_profile_id() IS NULL THEN
    RAISE EXCEPTION 'moderation permission required';
  END IF;
  IF _statuses IS NULL OR cardinality(_statuses) = 0 OR EXISTS (
    SELECT 1 FROM unnest(_statuses) AS s(value)
    WHERE s.value NOT IN ('open', 'reviewing', 'actioned', 'dismissed')
  ) THEN
    RAISE EXCEPTION 'invalid report status filter';
  END IF;

  RETURN QUERY
  SELECT r.id, r.target_kind, r.target_id, r.reason_code, r.details,
         r.evidence_snapshot, r.status, r.resolution, r.created_at
  FROM public.ugc_reports r
  WHERE r.status = ANY(_statuses)
  ORDER BY
    CASE WHEN _oldest_first THEN r.created_at END ASC,
    CASE WHEN NOT _oldest_first THEN r.created_at END DESC
  LIMIT LEAST(500, GREATEST(1, COALESCE(_limit, 200)));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_ugc_report(
  _report_id uuid,
  _decision text,
  _action_type text,
  _public_reason text,
  _internal_notes text DEFAULT NULL,
  _expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_admin uuid := public.current_profile_id();
  v_report public.ugc_reports%ROWTYPE;
  v_action_id uuid;
  v_metadata jsonb := '{}'::jsonb;
BEGIN
  IF NOT public.ugc_can_moderate() OR v_admin IS NULL THEN RAISE EXCEPTION 'moderation permission required'; END IF;
  IF _decision NOT IN ('actioned', 'dismissed') THEN RAISE EXCEPTION 'invalid decision'; END IF;
  _public_reason := NULLIF(btrim(_public_reason), '');
  IF _public_reason IS NULL OR char_length(_public_reason) > 1000 THEN RAISE EXCEPTION 'valid public reason required'; END IF;
  IF _internal_notes IS NOT NULL AND char_length(_internal_notes) > 3000 THEN RAISE EXCEPTION 'notes are too long'; END IF;
  IF _expires_at IS NOT NULL AND _expires_at <= now() THEN RAISE EXCEPTION 'expiry must be in the future'; END IF;

  SELECT * INTO v_report FROM public.ugc_reports WHERE id = _report_id FOR UPDATE;
  IF NOT FOUND OR v_report.status NOT IN ('open', 'reviewing') THEN RAISE EXCEPTION 'report is no longer actionable'; END IF;

  IF _decision = 'dismissed' THEN
    UPDATE public.ugc_reports SET status = 'dismissed', resolution = _public_reason,
      resolved_by_profile_id = v_admin, resolved_at = now(), updated_at = now()
    WHERE id = _report_id;
    RETURN NULL;
  END IF;

  IF _action_type NOT IN (
    'warning', 'hide_content', 'group_mute', 'group_ban',
    'suspend_posting', 'block_partner', 'deactivate_whatsapp_group'
  ) THEN RAISE EXCEPTION 'invalid moderation action'; END IF;

  IF _action_type = 'hide_content' THEN
    IF v_report.target_kind = 'group_message' THEN
      UPDATE public.group_messages SET moderation_status = 'hidden',
        content = NULL, media_url = NULL, media_type = NULL,
        moderated_at = now(), moderated_by_profile_id = v_admin,
        moderation_reason = _public_reason
      WHERE id = v_report.target_id;
    ELSIF v_report.target_kind = 'partner_post' THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('ugc:partner-post:' || v_report.target_id::text, 0)
      );
      UPDATE public.partner_posts SET moderation_status = 'hidden',
        moderated_at = now(), moderated_by_profile_id = v_admin,
        moderation_reason = _public_reason
      WHERE id = v_report.target_id;
    ELSIF v_report.target_kind = 'product_review' THEN
      UPDATE public.product_reviews
      SET hidden_at = now(), hidden_by = v_admin, hidden_reason = _public_reason,
          updated_at = now()
      WHERE id = v_report.target_id;
    ELSIF v_report.target_kind = 'product_review_reply' THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('ugc:review-reply:' || v_report.target_id::text, 0)
      );
      UPDATE public.product_reviews
      SET seller_reply = NULL, seller_replied_at = NULL,
          seller_reply_by_profile_id = NULL, updated_at = now()
      WHERE id = v_report.target_id;
    ELSE
      RAISE EXCEPTION 'hide_content only applies to supported community content';
    END IF;
  ELSIF _action_type = 'group_mute' THEN
    IF v_report.subject_profile_id IS NULL OR v_report.group_id IS NULL THEN RAISE EXCEPTION 'group subject required'; END IF;
    UPDATE public.group_members SET is_muted = (_expires_at IS NULL), muted_until = _expires_at, muted_by = v_admin
    WHERE group_id = v_report.group_id AND profile_id = v_report.subject_profile_id;
  ELSIF _action_type = 'group_ban' THEN
    IF v_report.subject_profile_id IS NULL OR v_report.group_id IS NULL THEN RAISE EXCEPTION 'group subject required'; END IF;
    UPDATE public.group_members SET is_banned = true, banned_by = v_admin
    WHERE group_id = v_report.group_id AND profile_id = v_report.subject_profile_id;
  ELSIF _action_type = 'suspend_posting' THEN
    IF v_report.subject_profile_id IS NULL THEN RAISE EXCEPTION 'profile subject required'; END IF;
  ELSIF _action_type = 'block_partner' THEN
    IF v_report.subject_partner_id IS NULL THEN RAISE EXCEPTION 'partner subject required'; END IF;
    SELECT jsonb_build_object('previous_status', status) INTO v_metadata
    FROM public.partners WHERE id = v_report.subject_partner_id;
    UPDATE public.partners SET status = 'blocked' WHERE id = v_report.subject_partner_id;
  ELSIF _action_type = 'deactivate_whatsapp_group' THEN
    IF v_report.target_kind <> 'whatsapp_group' THEN RAISE EXCEPTION 'WhatsApp group target required'; END IF;
    SELECT jsonb_build_object('previous_is_active', is_active) INTO v_metadata
    FROM public.whatsapp_groups WHERE id = v_report.target_id;
    UPDATE public.whatsapp_groups SET is_active = false WHERE id = v_report.target_id;
  END IF;

  INSERT INTO public.ugc_moderation_actions(
    report_id, subject_profile_id, subject_partner_id, action_type,
    target_kind, target_id, group_id, public_reason, internal_notes,
    expires_at, created_by_profile_id, metadata
  ) VALUES (
    v_report.id, v_report.subject_profile_id, v_report.subject_partner_id, _action_type,
    v_report.target_kind, v_report.target_id, v_report.group_id, _public_reason, _internal_notes,
    _expires_at, v_admin, COALESCE(v_metadata, '{}'::jsonb)
  ) RETURNING id INTO v_action_id;

  -- Partner timeline images live in the public store bucket. Quarantine them
  -- through the Storage API processor immediately after the database action;
  -- direct SQL deletion from storage.objects would orphan the physical file.
  IF _action_type = 'hide_content'
     AND v_report.target_kind = 'partner_post'
     AND NULLIF(v_report.evidence_snapshot->>'image_url', '') IS NOT NULL THEN
    INSERT INTO public.ugc_media_jobs(
      report_id, action_id, operation, source_bucket, source_path
    ) VALUES (
      v_report.id, v_action_id, 'quarantine', 'store-images',
      v_report.evidence_snapshot->>'image_url'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.ugc_reports SET status = 'actioned', resolution = _public_reason,
    resolved_by_profile_id = v_admin, resolved_at = now(), updated_at = now()
  WHERE id = _report_id;
  RETURN v_action_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.ugc_create_appeal(_action_id uuid, _statement text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE v_profile_id uuid := public.current_profile_id(); v_id uuid;
BEGIN
  _statement := btrim(_statement);
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF char_length(_statement) NOT BETWEEN 20 AND 3000 THEN RAISE EXCEPTION 'appeal must contain 20 to 3000 characters'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ugc_moderation_actions a
    WHERE a.id = _action_id
      AND a.subject_profile_id = v_profile_id
      AND a.revoked_at IS NULL
      AND a.created_at >= now() - interval '90 days'
  ) THEN RAISE EXCEPTION 'action is not appealable by this account'; END IF;
  INSERT INTO public.ugc_appeals(action_id, appellant_profile_id, statement)
  VALUES (_action_id, v_profile_id, _statement)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_resolve_ugc_appeal(
  _appeal_id uuid,
  _accepted boolean,
  _decision text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_admin uuid := public.current_profile_id();
  v_appeal public.ugc_appeals%ROWTYPE;
  v_action public.ugc_moderation_actions%ROWTYPE;
BEGIN
  IF NOT public.ugc_can_moderate() OR v_admin IS NULL THEN RAISE EXCEPTION 'moderation permission required'; END IF;
  _decision := NULLIF(btrim(_decision), '');
  IF _decision IS NULL OR char_length(_decision) > 3000 THEN RAISE EXCEPTION 'valid appeal decision required'; END IF;

  SELECT * INTO v_appeal FROM public.ugc_appeals WHERE id = _appeal_id FOR UPDATE;
  IF NOT FOUND OR v_appeal.status NOT IN ('pending', 'reviewing') THEN RAISE EXCEPTION 'appeal is no longer actionable'; END IF;
  SELECT * INTO v_action FROM public.ugc_moderation_actions WHERE id = v_appeal.action_id FOR UPDATE;
  IF v_action.created_by_profile_id = v_admin THEN RAISE EXCEPTION 'appeal must be reviewed by another admin'; END IF;

  IF _accepted THEN
    UPDATE public.ugc_moderation_actions SET revoked_at = now(), revoked_by_profile_id = v_admin
    WHERE id = v_action.id AND revoked_at IS NULL;
    IF v_action.action_type = 'group_mute' THEN
      UPDATE public.group_members gm
      SET is_muted = EXISTS (
            SELECT 1 FROM public.ugc_moderation_actions active
            WHERE active.id <> v_action.id
              AND active.action_type = 'group_mute'
              AND active.group_id = v_action.group_id
              AND active.subject_profile_id = v_action.subject_profile_id
              AND active.revoked_at IS NULL
              AND active.expires_at IS NULL
          ),
          muted_until = (
            SELECT max(active.expires_at) FROM public.ugc_moderation_actions active
            WHERE active.id <> v_action.id
              AND active.action_type = 'group_mute'
              AND active.group_id = v_action.group_id
              AND active.subject_profile_id = v_action.subject_profile_id
              AND active.revoked_at IS NULL
              AND active.expires_at > now()
          ),
          muted_by = (
            SELECT active.created_by_profile_id
            FROM public.ugc_moderation_actions active
            WHERE active.id <> v_action.id
              AND active.action_type = 'group_mute'
              AND active.group_id = v_action.group_id
              AND active.subject_profile_id = v_action.subject_profile_id
              AND active.revoked_at IS NULL
              AND (active.expires_at IS NULL OR active.expires_at > now())
            ORDER BY active.starts_at DESC
            LIMIT 1
          )
      WHERE gm.group_id = v_action.group_id AND gm.profile_id = v_action.subject_profile_id;
    ELSIF v_action.action_type = 'group_ban' THEN
      UPDATE public.group_members gm
      SET is_banned = EXISTS (
            SELECT 1 FROM public.ugc_moderation_actions active
            WHERE active.id <> v_action.id
              AND active.action_type = 'group_ban'
              AND active.group_id = v_action.group_id
              AND active.subject_profile_id = v_action.subject_profile_id
              AND active.revoked_at IS NULL
              AND (active.expires_at IS NULL OR active.expires_at > now())
          ),
          banned_by = (
            SELECT active.created_by_profile_id
            FROM public.ugc_moderation_actions active
            WHERE active.id <> v_action.id
              AND active.action_type = 'group_ban'
              AND active.group_id = v_action.group_id
              AND active.subject_profile_id = v_action.subject_profile_id
              AND active.revoked_at IS NULL
              AND (active.expires_at IS NULL OR active.expires_at > now())
            ORDER BY active.starts_at DESC
            LIMIT 1
          )
      WHERE gm.group_id = v_action.group_id AND gm.profile_id = v_action.subject_profile_id;
    ELSIF v_action.action_type = 'hide_content' AND v_action.target_kind = 'partner_post' THEN
      -- The Storage processor restores the quarantined object first and only
      -- then makes the public post visible again.
      UPDATE public.partner_posts SET moderated_at = now(),
        moderated_by_profile_id = v_admin,
        moderation_reason = 'Recurso aceito; restauração de mídia pendente.'
      WHERE id = v_action.target_id
        AND NOT EXISTS (
          SELECT 1 FROM public.ugc_moderation_actions active
          WHERE active.id <> v_action.id
            AND active.action_type = 'hide_content'
            AND active.target_kind = v_action.target_kind
            AND active.target_id = v_action.target_id
            AND active.revoked_at IS NULL
            AND (active.expires_at IS NULL OR active.expires_at > now())
        );
    ELSIF v_action.action_type = 'hide_content' AND v_action.target_kind = 'group_message' THEN
      UPDATE public.group_messages gm
      SET moderation_status = 'visible',
        content = NULLIF(r.evidence_snapshot->>'content', ''),
        media_url = NULLIF(r.evidence_snapshot->>'media_path', ''),
        media_type = NULLIF(r.evidence_snapshot->>'media_type', ''),
        moderated_at = now(), moderated_by_profile_id = v_admin,
        moderation_reason = _decision
      FROM public.ugc_reports r
      WHERE gm.id = v_action.target_id AND r.id = v_action.report_id
        AND NOT EXISTS (
          SELECT 1 FROM public.ugc_moderation_actions active
          WHERE active.id <> v_action.id
            AND active.action_type = 'hide_content'
            AND active.target_kind = v_action.target_kind
            AND active.target_id = v_action.target_id
            AND active.revoked_at IS NULL
            AND (active.expires_at IS NULL OR active.expires_at > now())
        );
    ELSIF v_action.action_type = 'hide_content' AND v_action.target_kind = 'product_review' THEN
      UPDATE public.product_reviews r
      SET hidden_at = NULL, hidden_by = NULL, hidden_reason = _decision,
          updated_at = now()
      WHERE r.id = v_action.target_id
        AND NOT EXISTS (
          SELECT 1 FROM public.ugc_moderation_actions active
          WHERE active.id <> v_action.id
            AND active.action_type = 'hide_content'
            AND active.target_kind = v_action.target_kind
            AND active.target_id = v_action.target_id
            AND active.revoked_at IS NULL
            AND (active.expires_at IS NULL OR active.expires_at > now())
        );
    ELSIF v_action.action_type = 'hide_content' AND v_action.target_kind = 'product_review_reply' THEN
      PERFORM pg_advisory_xact_lock(
        hashtextextended('ugc:review-reply:' || v_action.target_id::text, 0)
      );
      UPDATE public.product_reviews review
      SET seller_reply = NULLIF(report.evidence_snapshot->>'seller_reply', ''),
          seller_replied_at = NULLIF(report.evidence_snapshot->>'seller_replied_at', '')::timestamptz,
          seller_reply_by_profile_id = NULLIF(
            report.evidence_snapshot->>'seller_reply_by_profile_id', ''
          )::uuid,
          updated_at = now()
      FROM public.ugc_reports report
      WHERE review.id = v_action.target_id
        AND review.seller_reply IS NULL
        AND report.id = v_action.report_id
        AND NOT EXISTS (
          SELECT 1 FROM public.ugc_moderation_actions active
          WHERE active.id <> v_action.id
            AND active.action_type = 'hide_content'
            AND active.target_kind = v_action.target_kind
            AND active.target_id = v_action.target_id
            AND active.revoked_at IS NULL
            AND (active.expires_at IS NULL OR active.expires_at > now())
        );
    ELSIF v_action.action_type = 'block_partner' THEN
      UPDATE public.partners SET status = COALESCE(v_action.metadata->>'previous_status', 'approved')
      WHERE id = v_action.subject_partner_id
        AND NOT EXISTS (
          SELECT 1 FROM public.ugc_moderation_actions active
          WHERE active.id <> v_action.id
            AND active.action_type = 'block_partner'
            AND active.subject_partner_id = v_action.subject_partner_id
            AND active.revoked_at IS NULL
            AND (active.expires_at IS NULL OR active.expires_at > now())
        );
    ELSIF v_action.action_type = 'deactivate_whatsapp_group' THEN
      UPDATE public.whatsapp_groups SET is_active = COALESCE((v_action.metadata->>'previous_is_active')::boolean, true)
      WHERE id = v_action.target_id
        AND NOT EXISTS (
          SELECT 1 FROM public.ugc_moderation_actions active
          WHERE active.id <> v_action.id
            AND active.action_type = 'deactivate_whatsapp_group'
            AND active.target_id = v_action.target_id
            AND active.revoked_at IS NULL
            AND (active.expires_at IS NULL OR active.expires_at > now())
        );
    END IF;

    IF v_action.action_type = 'hide_content'
       AND v_action.target_kind = 'partner_post'
       AND NOT EXISTS (
         SELECT 1 FROM public.ugc_moderation_actions active
         WHERE active.id <> v_action.id
           AND active.action_type = 'hide_content'
           AND active.target_kind = v_action.target_kind
           AND active.target_id = v_action.target_id
           AND active.revoked_at IS NULL
           AND (active.expires_at IS NULL OR active.expires_at > now())
       ) THEN
      INSERT INTO public.ugc_media_jobs(
        report_id, action_id, operation, source_bucket, source_path,
        evidence_bucket, evidence_path
      )
      SELECT q.report_id, q.action_id, 'restore', q.source_bucket, q.source_path,
             q.evidence_bucket, q.evidence_path
      FROM public.ugc_media_jobs q
      WHERE q.action_id = v_action.id AND q.operation = 'quarantine'
      ORDER BY q.created_at DESC
      LIMIT 1
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  UPDATE public.ugc_appeals SET status = CASE WHEN _accepted THEN 'accepted' ELSE 'rejected' END,
    reviewer_profile_id = v_admin, decision = _decision, decided_at = now(), updated_at = now()
  WHERE id = _appeal_id;
  RETURN _accepted;
END;
$$;

CREATE OR REPLACE FUNCTION public.ugc_finalize_partner_post_restore(_action_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_action public.ugc_moderation_actions%ROWTYPE;
  v_restored boolean := false;
BEGIN
  IF auth.role() <> 'service_role' THEN RAISE EXCEPTION 'service_role required'; END IF;
  SELECT * INTO v_action
  FROM public.ugc_moderation_actions
  WHERE id = _action_id
  FOR UPDATE;
  IF NOT FOUND
     OR v_action.action_type <> 'hide_content'
     OR v_action.target_kind <> 'partner_post'
     OR v_action.revoked_at IS NULL THEN
    RAISE EXCEPTION 'action is not ready for restore';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('ugc:partner-post:' || v_action.target_id::text, 0)
  );
  UPDATE public.partner_posts p
  SET moderation_status = 'visible',
      moderated_at = now(),
      moderation_reason = 'Recurso aceito; conteúdo restaurado.'
  WHERE p.id = v_action.target_id
    AND p.moderation_status = 'hidden'
    AND NOT EXISTS (
      SELECT 1 FROM public.ugc_moderation_actions active
      WHERE active.id <> v_action.id
        AND active.action_type = 'hide_content'
        AND active.target_kind = 'partner_post'
        AND active.target_id = v_action.target_id
        AND active.revoked_at IS NULL
        AND (active.expires_at IS NULL OR active.expires_at > now())
    );
  v_restored := FOUND;
  RETURN v_restored;
END;
$$;
REVOKE ALL ON FUNCTION public.ugc_finalize_partner_post_restore(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ugc_finalize_partner_post_restore(uuid)
  TO service_role;

-- Operational privacy control. Run this RPC periodically with service_role;
-- keep the audit row and outcome, but remove raw evidence after the retention
-- window. Pending appeals are never purged, and appeals close after 90 days.
CREATE OR REPLACE FUNCTION public.ugc_purge_expired_report_evidence(
  _retention_days integer DEFAULT 180
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_purged integer := 0;
BEGIN
  IF auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;
  IF _retention_days < 90 OR _retention_days > 3650 THEN
    RAISE EXCEPTION 'retention must be between 90 and 3650 days';
  END IF;

  INSERT INTO public.ugc_media_jobs(
    report_id, action_id, operation, source_bucket, source_path
  )
  SELECT r.id, a.id, 'delete', 'group-media', r.evidence_snapshot->>'media_path'
  FROM public.ugc_reports r
  JOIN public.ugc_moderation_actions a
    ON a.report_id = r.id
   AND a.action_type = 'hide_content'
   AND a.revoked_at IS NULL
  WHERE r.status = 'actioned'
    AND r.target_kind = 'group_message'
    AND r.resolved_at < now() - make_interval(days => _retention_days)
    AND NULLIF(r.evidence_snapshot->>'media_path', '') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.ugc_appeals ap
      WHERE ap.action_id = a.id AND ap.status IN ('pending', 'reviewing')
    )
  ON CONFLICT DO NOTHING;

  INSERT INTO public.ugc_media_jobs(
    report_id, action_id, operation, source_bucket, source_path,
    evidence_bucket, evidence_path
  )
  SELECT r.id, a.id, 'delete', q.evidence_bucket, q.evidence_path,
         q.evidence_bucket, q.evidence_path
  FROM public.ugc_reports r
  JOIN public.ugc_moderation_actions a
    ON a.report_id = r.id
   AND a.action_type = 'hide_content'
   AND a.revoked_at IS NULL
  JOIN public.ugc_media_jobs q
    ON q.action_id = a.id
   AND q.operation = 'quarantine'
   AND q.status = 'completed'
  WHERE r.status = 'actioned'
    AND r.target_kind = 'partner_post'
    AND r.resolved_at < now() - make_interval(days => _retention_days)
    AND q.evidence_path IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.ugc_appeals ap
      WHERE ap.action_id = a.id AND ap.status IN ('pending', 'reviewing')
    )
  ON CONFLICT DO NOTHING;

  UPDATE public.ugc_reports r
  SET details = NULL,
      evidence_snapshot = jsonb_build_object(
        'purged', true,
        'purged_at', now(),
        'retention_days', _retention_days
      ),
      updated_at = now()
  WHERE r.status IN ('actioned', 'dismissed')
    AND r.resolved_at < now() - make_interval(days => _retention_days)
    AND r.evidence_snapshot->>'purged' IS DISTINCT FROM 'true'
    AND (
      r.target_kind <> 'group_message'
      OR NOT EXISTS (
        SELECT 1 FROM public.ugc_media_jobs j
        WHERE j.report_id = r.id
          AND j.operation = 'delete'
          AND j.source_bucket = 'group-media'
          AND j.status <> 'completed'
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.ugc_moderation_actions a
      JOIN public.ugc_appeals ap ON ap.action_id = a.id
      WHERE a.report_id = r.id
        AND ap.status IN ('pending', 'reviewing')
    );

  GET DIAGNOSTICS v_purged = ROW_COUNT;
  RETURN v_purged;
END;
$$;

-- Tight execute surface: internal helpers are not callable anonymously; user
-- and admin workflows are exposed only through the intended RPCs.
REVOKE ALL ON FUNCTION public.ugc_current_policy_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_can_moderate() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_has_current_policy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_accept_policy(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_current_user_blocks_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_profiles_block_each_other(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_current_user_blocks_partner(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_current_user_blocks_whatsapp_group(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_current_user_blocks_coach(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_profile_can_post(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_set_block(text, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_group_public_profiles(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_report(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_ugc_reports(text[], integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_resolve_ugc_report(uuid, text, text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_create_appeal(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_resolve_ugc_appeal(uuid, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_purge_expired_report_evidence(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_guard_group_message() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_guard_partner_post() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_guard_professional_public_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ugc_guard_professional_profile_fields() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ugc_current_policy_version(),
  public.ugc_can_moderate(), public.ugc_has_current_policy(), public.ugc_accept_policy(text),
  public.ugc_current_user_blocks_profile(uuid), public.ugc_profiles_block_each_other(uuid),
  public.ugc_current_user_blocks_partner(uuid), public.ugc_current_user_blocks_whatsapp_group(uuid),
  public.ugc_current_user_blocks_coach(uuid),
  public.ugc_profile_can_post(uuid), public.ugc_set_block(text, uuid, boolean),
  public.ugc_group_public_profiles(uuid), public.ugc_report(text, uuid, text, text),
  public.ugc_create_appeal(uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.ugc_current_user_blocks_partner(uuid)
  TO anon;
GRANT EXECUTE ON FUNCTION public.admin_list_ugc_reports(text[], integer, boolean),
  public.admin_resolve_ugc_report(uuid, text, text, text, text, timestamptz),
  public.admin_resolve_ugc_appeal(uuid, boolean, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.ugc_current_policy_version(),
  public.ugc_can_moderate(), public.ugc_has_current_policy(), public.ugc_accept_policy(text),
  public.ugc_current_user_blocks_profile(uuid), public.ugc_profiles_block_each_other(uuid),
  public.ugc_current_user_blocks_partner(uuid), public.ugc_current_user_blocks_whatsapp_group(uuid),
  public.ugc_current_user_blocks_coach(uuid),
  public.ugc_profile_can_post(uuid), public.ugc_set_block(text, uuid, boolean),
  public.ugc_group_public_profiles(uuid), public.ugc_report(text, uuid, text, text),
  public.admin_list_ugc_reports(text[], integer, boolean),
  public.admin_resolve_ugc_report(uuid, text, text, text, text, timestamptz),
  public.ugc_create_appeal(uuid, text), public.admin_resolve_ugc_appeal(uuid, boolean, text),
  public.ugc_purge_expired_report_evidence(integer)
  TO service_role;

COMMENT ON TABLE public.ugc_reports IS
  'User reports with server-derived evidence. Retain only as long as required for moderation/legal defense.';
COMMENT ON TABLE public.ugc_moderation_actions IS
  'Immutable moderation and sanction audit trail; revocation is recorded instead of deleting rows.';
