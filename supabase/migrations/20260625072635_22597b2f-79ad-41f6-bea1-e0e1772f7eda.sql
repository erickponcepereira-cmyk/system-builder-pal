-- Remove auth user órfão do João Augusto (perfil já foi removido)
DELETE FROM auth.users WHERE id = 'f178620d-4f26-47a2-b282-24c62da67af7';

-- Função de sanidade: lista perfis órfãos (coach/student sem registro correspondente)
CREATE OR REPLACE FUNCTION public.find_orphan_registrations()
RETURNS TABLE(profile_id uuid, user_id uuid, name text, email text, role text, created_at timestamptz, missing text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.user_id, p.name, p.email, p.role::text, p.created_at,
    CASE
      WHEN p.role = 'coach' AND NOT EXISTS (SELECT 1 FROM coaches c WHERE c.profile_id = p.id) THEN 'coach_record'
      WHEN p.role = 'student' AND NOT EXISTS (SELECT 1 FROM students s WHERE s.profile_id = p.id) THEN 'student_record'
    END AS missing
  FROM profiles p
  WHERE p.role IN ('coach','student')
    AND (
      (p.role = 'coach' AND NOT EXISTS (SELECT 1 FROM coaches c WHERE c.profile_id = p.id))
      OR (p.role = 'student' AND NOT EXISTS (SELECT 1 FROM students s WHERE s.profile_id = p.id))
    )
    AND p.created_at < now() - interval '10 minutes'
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.find_orphan_registrations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_orphan_registrations() TO authenticated, service_role;