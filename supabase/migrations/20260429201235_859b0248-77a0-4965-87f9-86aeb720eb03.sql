CREATE OR REPLACE FUNCTION public.profile_has_approved_coach(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.coaches c
    WHERE c.profile_id = _profile_id
      AND c.approved_at IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.profile_shares_group_with_current_user(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm_self
    JOIN public.profiles p_self ON p_self.id = gm_self.profile_id
    JOIN public.group_members gm_other ON gm_other.group_id = gm_self.group_id
    WHERE p_self.user_id = auth.uid()
      AND gm_other.profile_id = _profile_id
      AND COALESCE(gm_self.is_banned, false) = false
      AND COALESCE(gm_other.is_banned, false) = false
  )
$$;

CREATE OR REPLACE FUNCTION public.profile_is_referred_by_current_student(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.students referred
    WHERE referred.profile_id = _profile_id
      AND referred.referred_by_student_id = public.current_student_id()
  )
$$;

DROP POLICY IF EXISTS approved_coach_profiles_public_select ON public.profiles;
DROP POLICY IF EXISTS profiles_group_member_select ON public.profiles;
DROP POLICY IF EXISTS profiles_referrer_students_select ON public.profiles;
DROP POLICY IF EXISTS coaches_own_insert ON public.coaches;
DROP POLICY IF EXISTS coaches_own_select ON public.coaches;
DROP POLICY IF EXISTS coaches_own_update ON public.coaches;

CREATE POLICY approved_coach_profiles_public_select
ON public.profiles
FOR SELECT
USING (public.profile_has_approved_coach(id));

CREATE POLICY profiles_group_member_select
ON public.profiles
FOR SELECT
TO authenticated
USING (public.profile_shares_group_with_current_user(id));

CREATE POLICY profiles_referrer_students_select
ON public.profiles
FOR SELECT
TO authenticated
USING (public.profile_is_referred_by_current_student(id));

CREATE POLICY coaches_own_insert
ON public.coaches
FOR INSERT
TO authenticated
WITH CHECK (profile_id = public.current_profile_id());

CREATE POLICY coaches_own_select
ON public.coaches
FOR SELECT
TO authenticated
USING (profile_id = public.current_profile_id());

CREATE POLICY coaches_own_update
ON public.coaches
FOR UPDATE
TO authenticated
USING (profile_id = public.current_profile_id())
WITH CHECK (profile_id = public.current_profile_id());

REVOKE EXECUTE ON FUNCTION public.profile_has_approved_coach(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.profile_shares_group_with_current_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.profile_is_referred_by_current_student(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.profile_has_approved_coach(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_shares_group_with_current_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.profile_is_referred_by_current_student(uuid) TO authenticated;