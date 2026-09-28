-- O Hall da Fama mostra o nome de todos os campeões, não só os de quem está vendo.
--
-- A tela buscava os campeões em `competition_hall_of_fame`, que todo mundo lê,
-- mas o nome vinha do cadastro do aluno — e a RLS de `students` e `profiles`
-- só deixa ler o próprio coach, Master Coach, admin e o próprio aluno. Para
-- qualquer outro coach ou aluno o nome chegava nulo e a tela mostrava "—" e
-- "?". Em 28/09/2026 era o José Eduardo, campeão masculino de julho e de
-- agosto, aluno do Nathan, sumindo para quem não é do Nathan.
--
-- Os termos de uso preveem o Hall da Fama público. Esta função entrega só o
-- que a tela mostra — nome, foto e coach dos campeões de desafio finalizado —
-- sem abrir `students` nem `profiles` para ninguém.
CREATE OR REPLACE FUNCTION public.hall_da_fama_campeoes()
RETURNS TABLE(id uuid, gender text, result_kg numeric, result_pct numeric, prize_amount numeric,
              student_id uuid, student_name text, avatar_url text, photo_url text,
              coach_id uuid, coach_name text,
              competition_id uuid, month integer, year integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT h.id, h.gender, h.result_kg, h.result_pct, h.prize_amount,
         h.student_id, p.name::text, p.avatar_url, p.photo_url,
         h.coach_id, pc.name::text,
         c.id, c.month, c.year
    FROM public.competition_hall_of_fame h
    JOIN public.competitions c ON c.id = h.competition_id AND c.finalized_at IS NOT NULL
    LEFT JOIN public.students s ON s.id = h.student_id
    LEFT JOIN public.profiles p ON p.id = s.profile_id
    LEFT JOIN public.coaches co ON co.id = h.coach_id
    LEFT JOIN public.profiles pc ON pc.id = co.profile_id
   ORDER BY h.created_at DESC
   LIMIT 500;
$fn$;

REVOKE ALL ON FUNCTION public.hall_da_fama_campeoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hall_da_fama_campeoes() TO authenticated;
