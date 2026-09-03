-- Release batch: account deletion request lifecycle (after the latest Lovable migrations).
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  email_snapshot text NOT NULL,
  role_snapshot text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'cancelled', 'completed', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL DEFAULT (now() + interval '15 days'),
  cancelled_at timestamptz,
  completed_at timestamptz,
  processed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  processing_notes text,
  retention_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_one_pending_per_user
  ON public.account_deletion_requests (user_id)
  WHERE status = 'pending' AND user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS account_deletion_requests_status_due_idx
  ON public.account_deletion_requests (status, due_at);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Users can view own deletion requests"
  ON public.account_deletion_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view deletion requests" ON public.account_deletion_requests;
CREATE POLICY "Admins can view deletion requests"
  ON public.account_deletion_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND p.role = 'admin'
    )
  );

REVOKE ALL ON TABLE public.account_deletion_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.account_deletion_requests TO authenticated;
GRANT ALL ON TABLE public.account_deletion_requests TO service_role;

COMMENT ON TABLE public.account_deletion_requests IS
  'Fila auditável de pedidos de exclusão. O processamento cancela recorrências, remove arquivos e anonimiza registros sujeitos a retenção antes de apagar a identidade.';
