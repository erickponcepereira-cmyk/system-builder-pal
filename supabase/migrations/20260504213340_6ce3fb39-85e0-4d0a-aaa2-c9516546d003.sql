-- 1. Master admin + permissions columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_master_admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_permissions JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.profiles SET is_master_admin = true
WHERE email = 'erickponcepereira@outlook.com';

-- 2. Helper functions
CREATE OR REPLACE FUNCTION public.is_master_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role = 'admin' AND is_master_admin = true
  )
$$;

CREATE OR REPLACE FUNCTION public.count_active_admins()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.profiles
  WHERE role = 'admin' AND COALESCE(status, 'active') <> 'blocked'
$$;

-- 3. Audit log
CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  before_role TEXT,
  after_role TEXT,
  before_permissions JSONB,
  after_permissions JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_audit_log_admin_select ON public.admin_audit_log
  FOR SELECT USING (public.is_admin(auth.uid()));

CREATE POLICY admin_audit_log_admin_insert ON public.admin_audit_log
  FOR INSERT WITH CHECK (public.is_admin(auth.uid()));

-- 4. Trigger: prevent removing last admin + write audit
CREATE OR REPLACE FUNCTION public.guard_profile_admin_changes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  actor_id UUID;
  remaining INTEGER;
BEGIN
  SELECT id INTO actor_id FROM public.profiles WHERE user_id = auth.uid();

  -- Role change rules
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Only master admin (or null actor = system) can change admin role
    IF auth.uid() IS NOT NULL AND NOT public.is_master_admin(auth.uid()) THEN
      IF OLD.role = 'admin' OR NEW.role = 'admin' THEN
        RAISE EXCEPTION 'Apenas o admin máster pode promover ou revogar administradores';
      END IF;
    END IF;

    -- Cannot demote the master admin
    IF OLD.is_master_admin = true AND NEW.role <> 'admin' THEN
      RAISE EXCEPTION 'Não é permitido revogar o admin máster';
    END IF;

    -- Cannot leave system without admin
    IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
      SELECT COUNT(*) INTO remaining FROM public.profiles
      WHERE role = 'admin' AND id <> OLD.id AND COALESCE(status,'active') <> 'blocked';
      IF remaining < 1 THEN
        RAISE EXCEPTION 'Não é possível revogar o último administrador ativo';
      END IF;
    END IF;

    INSERT INTO public.admin_audit_log
      (actor_profile_id, target_profile_id, action, before_role, after_role)
    VALUES
      (actor_id, NEW.id,
       CASE WHEN NEW.role='admin' THEN 'promote_admin'
            WHEN OLD.role='admin' THEN 'revoke_admin'
            ELSE 'role_change' END,
       OLD.role::text, NEW.role::text);
  END IF;

  -- Permissions change audit (admin only)
  IF NEW.admin_permissions IS DISTINCT FROM OLD.admin_permissions
     AND (NEW.role = 'admin' OR OLD.role = 'admin') THEN
    IF auth.uid() IS NOT NULL AND NOT public.is_master_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Apenas o admin máster pode editar permissões de administradores';
    END IF;
    INSERT INTO public.admin_audit_log
      (actor_profile_id, target_profile_id, action, before_permissions, after_permissions)
    VALUES (actor_id, NEW.id, 'permissions_change', OLD.admin_permissions, NEW.admin_permissions);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_admin_changes ON public.profiles;
CREATE TRIGGER trg_guard_profile_admin_changes
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_admin_changes();

-- 5. Tighten RLS on profiles: admin update remains via is_admin, but role/permission edits funnel through trigger.
-- Existing policies already allow admin full access; trigger enforces master rule.