
DROP POLICY IF EXISTS profiles_master_coach_select ON public.profiles;
CREATE POLICY profiles_master_coach_select
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.is_master_coach(public.current_coach_id())
  AND EXISTS (SELECT 1 FROM public.students s WHERE s.profile_id = profiles.id)
);
