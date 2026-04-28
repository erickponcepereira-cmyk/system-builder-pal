CREATE OR REPLACE FUNCTION public.join_student_challenge_group(_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id UUID;
  current_student_id UUID;
  target_product_id UUID;
  has_access BOOLEAN := false;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF current_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;
  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  SELECT product_id INTO target_product_id
  FROM public.challenge_groups
  WHERE id = _group_id AND COALESCE(is_active, true) = true;

  IF target_product_id IS NULL THEN
    RAISE EXCEPTION 'Grupo indisponível';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions sub
    WHERE sub.student_id = current_student_id
      AND sub.product_id = target_product_id
      AND sub.status = 'active'
      AND sub.end_date >= CURRENT_DATE
  ) INTO has_access;

  IF NOT has_access AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Este grupo pertence a um desafio que ainda não está ativo na sua conta';
  END IF;

  INSERT INTO public.group_members (group_id, profile_id, role)
  VALUES (_group_id, current_profile_id, 'member')
  ON CONFLICT DO NOTHING;
END;
$$;

DROP POLICY IF EXISTS "group_messages_member_insert" ON public.group_messages;

CREATE POLICY "group_messages_member_insert"
ON public.group_messages
FOR INSERT
WITH CHECK (
  sender_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  AND group_id IN (
    SELECT gm.group_id
    FROM public.group_members gm
    JOIN public.profiles p ON p.id = gm.profile_id
    JOIN public.challenge_groups cg ON cg.id = gm.group_id
    WHERE p.user_id = auth.uid()
      AND COALESCE(gm.is_banned, false) = false
      AND (gm.muted_until IS NULL OR gm.muted_until < now())
      AND (
        cg.send_permission = 'all_members'
        OR gm.role IN ('coach', 'admin')
      )
  )
);

CREATE POLICY "group_messages_sender_soft_delete"
ON public.group_messages
FOR UPDATE
USING (sender_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
WITH CHECK (sender_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "profiles_group_member_select"
ON public.profiles
FOR SELECT
USING (
  id IN (
    SELECT gm_other.profile_id
    FROM public.group_members gm_self
    JOIN public.profiles p_self ON p_self.id = gm_self.profile_id
    JOIN public.group_members gm_other ON gm_other.group_id = gm_self.group_id
    WHERE p_self.user_id = auth.uid()
      AND COALESCE(gm_self.is_banned, false) = false
      AND COALESCE(gm_other.is_banned, false) = false
  )
);

CREATE INDEX IF NOT EXISTS idx_group_members_group_profile ON public.group_members(group_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_student_product_status ON public.subscriptions(student_id, product_id, status);