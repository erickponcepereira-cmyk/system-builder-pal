-- Release batch: audited push delivery (after the latest Lovable migrations).
CREATE TABLE IF NOT EXISTS public.push_notification_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  target_user_id UUID NOT NULL,
  title VARCHAR(80) NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body_length INTEGER NOT NULL CHECK (body_length BETWEEN 1 AND 300),
  data_keys TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  tokens_found INTEGER NOT NULL DEFAULT 0 CHECK (tokens_found >= 0),
  sent INTEGER NOT NULL DEFAULT 0 CHECK (sent >= 0),
  failed INTEGER NOT NULL DEFAULT 0 CHECK (failed >= 0),
  cleaned_invalid_tokens INTEGER NOT NULL DEFAULT 0 CHECK (cleaned_invalid_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_notification_audit_actor_created
  ON public.push_notification_audit (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_push_notification_audit_target_created
  ON public.push_notification_audit (target_user_id, created_at DESC);

ALTER TABLE public.push_notification_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_notification_audit FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.push_notification_audit TO authenticated;
GRANT ALL ON TABLE public.push_notification_audit TO service_role;

DROP POLICY IF EXISTS push_notification_audit_admin_select
  ON public.push_notification_audit;
CREATE POLICY push_notification_audit_admin_select
  ON public.push_notification_audit
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

COMMENT ON TABLE public.push_notification_audit IS
  'Metadados de entrega de push para auditoria e rate limiting; o corpo da mensagem e tokens nao sao armazenados.';
