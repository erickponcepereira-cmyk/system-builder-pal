-- ============================================================
-- LGPD Phase 1: CPF masking infrastructure + access audit log
-- ============================================================

-- 1) Audit log of sensitive data access (LGPD Art. 37 - record of operations)
CREATE TABLE IF NOT EXISTS public.lgpd_access_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_user_id UUID NOT NULL,
  actor_role TEXT NOT NULL,
  target_user_id UUID NOT NULL,
  field TEXT NOT NULL,                  -- 'cpf' | 'email' | 'phone' | ...
  reason TEXT,                          -- justificativa opcional
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.lgpd_access_log TO authenticated;
GRANT ALL ON public.lgpd_access_log TO service_role;
ALTER TABLE public.lgpd_access_log ENABLE ROW LEVEL SECURITY;

-- Only admins may read the log
CREATE POLICY "Only admins read LGPD access log"
  ON public.lgpd_access_log FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
            WHERE p.user_id = auth.uid()
              AND (p.role = 'admin' OR p.is_master_admin = true))
  );

CREATE INDEX IF NOT EXISTS idx_lgpd_access_log_target ON public.lgpd_access_log(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lgpd_access_log_actor ON public.lgpd_access_log(actor_user_id, created_at DESC);

-- 2) RPC: own CPF (owner only, sem log)
CREATE OR REPLACE FUNCTION public.get_my_cpf()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cpf TEXT;
BEGIN
  SELECT cpf INTO v_cpf FROM public.profiles WHERE user_id = auth.uid();
  RETURN v_cpf;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_cpf() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_cpf() TO authenticated;

-- 3) RPC: admin reveals another user's CPF, ALWAYS logging
CREATE OR REPLACE FUNCTION public.admin_reveal_cpf(target_user_id UUID, reason TEXT DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
  v_cpf TEXT;
  v_role TEXT;
BEGIN
  -- authorize: admin or master_admin
  SELECT (role = 'admin' OR is_master_admin = true), role
    INTO v_is_admin, v_role
  FROM public.profiles
  WHERE user_id = auth.uid();

  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Forbidden: only admins may reveal CPF' USING ERRCODE = '42501';
  END IF;

  SELECT cpf INTO v_cpf FROM public.profiles WHERE user_id = target_user_id;

  -- always log the access (LGPD audit trail)
  INSERT INTO public.lgpd_access_log (actor_user_id, actor_role, target_user_id, field, reason)
  VALUES (auth.uid(), COALESCE(v_role, 'admin'), target_user_id, 'cpf', reason);

  RETURN v_cpf;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reveal_cpf(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reveal_cpf(UUID, TEXT) TO authenticated;

-- 4) Make avatars bucket private (we will serve via signed URLs)
--    (handled via storage_update_bucket tool, not SQL)

-- 5) Allow authenticated users to read signed URLs for evolution/food/group/avatars
--    (their existing RLS policies on storage.objects continue to govern read access;
--     this migration does not relax them)

COMMENT ON TABLE public.lgpd_access_log IS 'LGPD Art. 37 — registro de acessos a dados pessoais sensíveis (CPF, etc).';
COMMENT ON FUNCTION public.admin_reveal_cpf(UUID, TEXT) IS 'Revela CPF de outro usuário (somente admin). Toda chamada é registrada em lgpd_access_log.';
COMMENT ON FUNCTION public.get_my_cpf() IS 'Retorna o CPF do próprio usuário autenticado. Não gera log.';