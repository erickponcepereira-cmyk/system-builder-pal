CREATE OR REPLACE FUNCTION public.profile_has_student(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.students s
    WHERE s.profile_id = _profile_id
  )
$function$;

DROP POLICY IF EXISTS profiles_public_basic_select ON public.profiles;
CREATE POLICY profiles_public_basic_select
ON public.profiles
FOR SELECT
USING (public.profile_has_approved_coach(id));

DROP POLICY IF EXISTS profiles_master_coach_select ON public.profiles;
CREATE POLICY profiles_master_coach_select
ON public.profiles
FOR SELECT
USING (
  public.is_master_coach(public.current_coach_id())
  AND public.profile_has_student(id)
);