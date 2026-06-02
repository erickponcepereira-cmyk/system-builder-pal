
GRANT SELECT (id, profile_id, referral_code, approved_at, upline_coach_id) ON public.coaches TO anon;
GRANT SELECT (id, profile_id, referral_code, approved_at, upline_coach_id) ON public.coaches TO authenticated;
GRANT SELECT (id, name, city, state, role) ON public.profiles TO anon;
GRANT SELECT (id, name, city, state, role) ON public.profiles TO authenticated;

DROP POLICY IF EXISTS profiles_public_basic_select ON public.profiles;
CREATE POLICY profiles_public_basic_select ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.coaches c
      WHERE c.profile_id = profiles.id AND c.approved_at IS NOT NULL
    )
  );
