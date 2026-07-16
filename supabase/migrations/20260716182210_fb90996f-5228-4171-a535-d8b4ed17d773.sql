CREATE OR REPLACE FUNCTION public.current_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND role = 'admin'
  )
$function$;

CREATE OR REPLACE FUNCTION public.is_coach(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = _user_id
      AND role = 'coach'
  )
$function$;

CREATE OR REPLACE FUNCTION public.current_coach_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT c.id
  FROM public.coaches c
  JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT s.id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.profile_shares_group_with_current_user(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members gm_self
    JOIN public.group_members gm_other ON gm_other.group_id = gm_self.group_id
    WHERE gm_self.profile_id = public.current_profile_id()
      AND gm_other.profile_id = _profile_id
      AND COALESCE(gm_self.is_banned, false) = false
      AND COALESCE(gm_other.is_banned, false) = false
  )
$function$;

CREATE OR REPLACE FUNCTION public.profile_is_referred_by_current_student(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.students referred
    WHERE referred.profile_id = _profile_id
      AND referred.referred_by_student_id = public.current_student_id()
  )
$function$;

CREATE OR REPLACE FUNCTION public.profile_has_approved_coach(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.coaches c
    WHERE c.profile_id = _profile_id
      AND c.approved_at IS NOT NULL
  )
$function$;