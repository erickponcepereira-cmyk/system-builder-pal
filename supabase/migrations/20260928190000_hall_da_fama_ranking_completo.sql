-- O ranking do Hall da Fama (% gordura, % músculo, kg perdidos) passa a ser o
-- mesmo para todo mundo.
--
-- As abas liam `competition_enrollments` direto, e a RLS dela só entrega a
-- inscrição do próprio aluno, a dos alunos do próprio coach, ou tudo para admin
-- e Master Coach. Na prática um aluno via só a si mesmo — a Vanessa enxergava 1
-- de 48 inscrições de desafios finalizados — e o "ranking" não era ranking.
--
-- Liberado para todos por decisão do Erick (28/09/2026). A função entrega só o
-- que a tela mostra: nome, foto, coach, mês e o resultado já calculado. Peso,
-- gordura e massa muscular brutos não saem, e os links de auditoria
-- (`*_share_url`) só vão para admin. Só entram desafios finalizados, como na
-- tela.
CREATE OR REPLACE FUNCTION public.hall_da_fama_ranking()
RETURNS TABLE(id uuid, gender text, student_id uuid, coach_id uuid,
              result_fat_pct_lost numeric, result_muscle_gain_pct numeric, result_kg_lost numeric,
              initial_share_url text, final_share_url text,
              student_name text, avatar_url text, photo_url text, coach_name text,
              competition_id uuid, month integer, year integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT e.id, e.gender, e.student_id, e.coach_id,
         e.result_fat_pct_lost, e.result_muscle_gain_pct, e.result_kg_lost,
         CASE WHEN public.is_admin(auth.uid()) THEN e.initial_share_url END,
         CASE WHEN public.is_admin(auth.uid()) THEN e.final_share_url END,
         p.name::text, p.avatar_url, p.photo_url, pc.name::text,
         c.id, c.month, c.year
    FROM public.competition_enrollments e
    JOIN public.competitions c ON c.id = e.competition_id AND c.finalized_at IS NOT NULL
    LEFT JOIN public.students s ON s.id = e.student_id
    LEFT JOIN public.profiles p ON p.id = s.profile_id
    LEFT JOIN public.coaches co ON co.id = e.coach_id
    LEFT JOIN public.profiles pc ON pc.id = co.profile_id
   LIMIT 2000;
$fn$;

REVOKE ALL ON FUNCTION public.hall_da_fama_ranking() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hall_da_fama_ranking() TO authenticated;
