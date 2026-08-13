-- Treino montado pela academia.
--
-- A academia atua como master coach: pode montar treino para aluno de qualquer
-- coach, sem mudar o vinculo nem a comissao. Nada aqui toca students.coach_id.
--
-- workout_plans.coach_id e a AUTORIA do plano, coluna diferente de
-- students.coach_id, que e o DONO do aluno. Por isso o modelo nao precisou
-- mudar. Falta apenas registrar quem, como pessoa, montou.

-- 1. Quem montou -------------------------------------------------------------
-- Aditiva e anulavel: nada que ja insere em workout_plans quebra.

ALTER TABLE public.workout_plans
  ADD COLUMN IF NOT EXISTS montado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.workout_plans.montado_por IS
  'Perfil que montou o plano. Autoria, nao propriedade: o aluno continua do coach em students.coach_id.';

-- 2. Aplicar um modelo pronto a um aluno -------------------------------------
-- Copia os itens do modelo para exercicios reais do plano. O modelo continua
-- intacto: alterar o treino do aluno depois nao mexe no modelo, e vice-versa.

CREATE OR REPLACE FUNCTION public.academia_treino_do_modelo(
  p_partner_id  uuid,
  p_student_id  uuid,
  p_template_id uuid,
  p_montado_por uuid,
  p_nome        text,
  p_dia         smallint
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items jsonb;
  v_nome  text;
  v_plan  uuid;
BEGIN
  IF NOT public.academia_pode_ver(p_partner_id) THEN
    RAISE EXCEPTION 'Sem acesso a esta academia.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.students s WHERE s.id = p_student_id) THEN
    RAISE EXCEPTION 'Aluno nao encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT t.items, t.name INTO v_items, v_nome
    FROM public.workout_templates t
   WHERE t.id = p_template_id AND t.is_active;

  IF v_items IS NULL THEN
    RAISE EXCEPTION 'Modelo de treino nao encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  -- coach_id fica nulo de proposito: quem montou foi a academia, e atribuir a
  -- autoria ao coach do aluno seria mentira no historico.
  INSERT INTO public.workout_plans (student_id, coach_id, name, day_of_week, montado_por, active)
  VALUES (p_student_id, NULL, COALESCE(NULLIF(trim(p_nome), ''), v_nome), p_dia, p_montado_por, true)
  RETURNING id INTO v_plan;

  INSERT INTO public.workout_exercises
    (plan_id, order_index, exercise_name, sets, reps, load_kg, rest_seconds, notes, is_cardio)
  SELECT v_plan,
         COALESCE(NULLIF(it->>'order_index', '')::int, (ord - 1)::int),
         COALESCE(NULLIF(it->>'exercise_name', ''), NULLIF(it->>'name', ''), 'Exercicio'),
         COALESCE(NULLIF(it->>'sets', '')::int, 3),
         NULLIF(it->>'reps', ''),
         NULLIF(it->>'load_kg', '')::numeric,
         COALESCE(NULLIF(it->>'rest_seconds', '')::int, 60),
         NULLIF(it->>'notes', ''),
         COALESCE(NULLIF(it->>'is_cardio', '')::boolean, false)
    FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(it, ord);

  RETURN v_plan;
END;
$$;

-- 3. Treinos do aluno, com autoria e com o dono do aluno ---------------------
-- Devolve junto quem e o coach responsavel, porque a academia precisa ver de
-- quem e o aluno antes de mexer nele.

CREATE OR REPLACE FUNCTION public.academia_treinos_do_aluno(p_partner_id uuid, p_student_id uuid)
RETURNS TABLE (
  plano_id uuid,
  nome text,
  dia_semana smallint,
  ativo boolean,
  criado_em timestamptz,
  exercicios integer,
  montado_por_nome text,
  coach_do_aluno text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT w.id,
         w.name,
         w.day_of_week,
         w.active,
         w.created_at,
         (SELECT count(*)::integer FROM public.workout_exercises e WHERE e.plan_id = w.id),
         COALESCE(autor.name, cprof.name, 'Nao informado')::text,
         COALESCE(dono.name, 'Sem coach')::text
    FROM public.workout_plans w
    LEFT JOIN public.profiles autor ON autor.id = w.montado_por
    LEFT JOIN public.coaches   c     ON c.id = w.coach_id
    LEFT JOIN public.profiles  cprof ON cprof.id = c.profile_id
    LEFT JOIN public.students  s     ON s.id = w.student_id
    LEFT JOIN public.coaches   dc    ON dc.id = s.coach_id
    LEFT JOIN public.profiles  dono  ON dono.id = dc.profile_id
   WHERE w.student_id = p_student_id
     AND public.academia_pode_ver(p_partner_id)
   ORDER BY w.active DESC, w.created_at DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.academia_treino_do_modelo(uuid, uuid, uuid, uuid, text, smallint) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.academia_treinos_do_aluno(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.academia_treino_do_modelo(uuid, uuid, uuid, uuid, text, smallint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.academia_treinos_do_aluno(uuid, uuid) TO authenticated, service_role;
