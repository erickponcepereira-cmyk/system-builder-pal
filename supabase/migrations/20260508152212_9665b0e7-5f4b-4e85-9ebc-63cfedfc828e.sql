DROP FUNCTION IF EXISTS public.list_coach_team_clients();
CREATE OR REPLACE FUNCTION public.list_coach_team_clients()
 RETURNS TABLE(id uuid, name text, email text, phone text, cpf text, coach_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH RECURSIVE team AS (
    SELECT c.id
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
    UNION ALL
    SELECT child.id
    FROM public.coaches child
    JOIN team parent ON child.upline_coach_id = parent.id
    WHERE child.approved_at IS NOT NULL
      AND child.blocked_at IS NULL
  )
  SELECT s.id,
         COALESCE(p.name, 'Cliente')::text AS name,
         p.email::text AS email,
         p.phone::text AS phone,
         p.cpf::text AS cpf,
         s.coach_id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.coach_id IN (SELECT id FROM team)
  ORDER BY p.name NULLS LAST, p.email NULLS LAST;
$function$;