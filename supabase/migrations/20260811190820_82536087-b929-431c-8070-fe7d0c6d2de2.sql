CREATE TABLE public.whatsapp_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_kind text NOT NULL CHECK (owner_kind IN ('partner','professional')),
  owner_partner_id uuid REFERENCES public.partners(id) ON DELETE CASCADE,
  owner_coach_id uuid REFERENCES public.coaches(id) ON DELETE CASCADE,
  name text NOT NULL,
  invite_url text,
  phone text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_groups_owner_ck CHECK (
    (owner_kind = 'partner' AND owner_partner_id IS NOT NULL AND owner_coach_id IS NULL)
    OR (owner_kind = 'professional' AND owner_coach_id IS NOT NULL AND owner_partner_id IS NULL)
  ),
  CONSTRAINT whatsapp_groups_target_ck CHECK (invite_url IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX whatsapp_groups_partner_uq ON public.whatsapp_groups(owner_partner_id) WHERE owner_partner_id IS NOT NULL;
CREATE UNIQUE INDEX whatsapp_groups_coach_uq ON public.whatsapp_groups(owner_coach_id) WHERE owner_coach_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_groups TO authenticated;
GRANT ALL ON public.whatsapp_groups TO service_role;

ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Dono do grupo gerencia" ON public.whatsapp_groups
  FOR ALL TO authenticated
  USING (
    public.current_user_is_admin()
    OR (owner_coach_id IS NOT NULL AND owner_coach_id IN (SELECT c.id FROM public.coaches c WHERE c.profile_id = public.current_profile_id()))
    OR (owner_partner_id IS NOT NULL AND (
        owner_partner_id IN (SELECT p.id FROM public.partners p WHERE p.profile_id = public.current_profile_id())
        OR owner_partner_id IN (SELECT m.partner_id FROM public.partner_members m WHERE m.profile_id = public.current_profile_id())
    ))
  )
  WITH CHECK (
    public.current_user_is_admin()
    OR (owner_coach_id IS NOT NULL AND owner_coach_id IN (SELECT c.id FROM public.coaches c WHERE c.profile_id = public.current_profile_id()))
    OR (owner_partner_id IS NOT NULL AND (
        owner_partner_id IN (SELECT p.id FROM public.partners p WHERE p.profile_id = public.current_profile_id())
        OR owner_partner_id IN (SELECT m.partner_id FROM public.partner_members m WHERE m.profile_id = public.current_profile_id())
    ))
  );

CREATE TRIGGER whatsapp_groups_set_updated_at
  BEFORE UPDATE ON public.whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();