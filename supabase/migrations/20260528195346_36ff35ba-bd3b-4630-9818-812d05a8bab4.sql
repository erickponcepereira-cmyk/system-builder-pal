
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_challenge_access boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.competitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month       integer NOT NULL CHECK (month BETWEEN 1 AND 12),
  year        integer NOT NULL CHECK (year >= 2024),
  status      text    NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed')),
  prize_amount numeric NOT NULL DEFAULT 1000.00,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (month, year)
);
GRANT SELECT ON public.competitions TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;

CREATE TABLE IF NOT EXISTS public.competition_groups (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id       uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  group_number         integer NOT NULL CHECK (group_number BETWEEN 1 AND 4),
  initial_start_date   date NOT NULL,
  initial_end_date     date NOT NULL,
  final_weigh_in_date  date NOT NULL,
  award_date           date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_id, group_number)
);
GRANT SELECT ON public.competition_groups TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.competition_groups TO authenticated;
GRANT ALL ON public.competition_groups TO service_role;

CREATE TABLE IF NOT EXISTS public.competition_enrollments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id   uuid NOT NULL REFERENCES public.competitions(id),
  group_id         uuid NOT NULL REFERENCES public.competition_groups(id),
  student_id       uuid NOT NULL REFERENCES public.students(id),
  coach_id         uuid NOT NULL REFERENCES public.coaches(id),
  gender           text NOT NULL CHECK (gender IN ('M','F')),
  initial_date     date,
  initial_weight   numeric(5,2),
  final_date       date GENERATED ALWAYS AS (initial_date + 29) STORED,
  final_weight     numeric(5,2),
  result_kg        numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN initial_weight IS NOT NULL AND final_weight IS NOT NULL
         THEN ROUND(initial_weight - final_weight, 2) END
  ) STORED,
  result_pct       numeric(5,2) GENERATED ALWAYS AS (
    CASE WHEN initial_weight > 0 AND final_weight IS NOT NULL
         THEN ROUND((initial_weight - final_weight) / initial_weight * 100, 2) END
  ) STORED,
  status           text NOT NULL DEFAULT 'enrolled'
    CHECK (status IN ('enrolled','scheduled_initial','weighed_initial','scheduled_final','weighed_final')),
  enrolled_by      text NOT NULL DEFAULT 'system' CHECK (enrolled_by IN ('system','admin','coach')),
  enrolled_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, competition_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competition_enrollments TO authenticated;
GRANT ALL ON public.competition_enrollments TO service_role;

CREATE TABLE IF NOT EXISTS public.competition_appointments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id  uuid NOT NULL REFERENCES public.competition_enrollments(id) ON DELETE CASCADE,
  student_id     uuid NOT NULL REFERENCES public.students(id),
  coach_id       uuid NOT NULL REFERENCES public.coaches(id),
  type           text NOT NULL CHECK (type IN ('initial','final')),
  requested_date date NOT NULL,
  requested_time time NOT NULL,
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','completed','cancelled')),
  weight_recorded numeric(5,2),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competition_appointments TO authenticated;
GRANT ALL ON public.competition_appointments TO service_role;

CREATE TABLE IF NOT EXISTS public.competition_hall_of_fame (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id   uuid NOT NULL REFERENCES public.competitions(id),
  enrollment_id    uuid NOT NULL REFERENCES public.competition_enrollments(id),
  student_id       uuid NOT NULL REFERENCES public.students(id),
  coach_id         uuid NOT NULL REFERENCES public.coaches(id),
  gender           text NOT NULL CHECK (gender IN ('M','F')),
  initial_weight   numeric(5,2) NOT NULL,
  final_weight     numeric(5,2) NOT NULL,
  result_kg        numeric(5,2) NOT NULL,
  result_pct       numeric(5,2) NOT NULL,
  prize_amount     numeric NOT NULL DEFAULT 1000.00,
  prize_paid       boolean NOT NULL DEFAULT false,
  prize_paid_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.competition_hall_of_fame TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.competition_hall_of_fame TO authenticated;
GRANT ALL ON public.competition_hall_of_fame TO service_role;

ALTER TABLE public.competitions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_enrollments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_hall_of_fame ENABLE ROW LEVEL SECURITY;

CREATE POLICY "competitions_read_all"   ON public.competitions       FOR SELECT USING (true);
CREATE POLICY "comp_groups_read_all"    ON public.competition_groups  FOR SELECT USING (true);
CREATE POLICY "hall_of_fame_read_all"   ON public.competition_hall_of_fame FOR SELECT USING (true);

CREATE POLICY "competitions_admin"      ON public.competitions             FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "comp_groups_admin"       ON public.competition_groups       FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "enrollments_admin"       ON public.competition_enrollments  FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "appointments_admin"      ON public.competition_appointments FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "hall_of_fame_admin"      ON public.competition_hall_of_fame FOR ALL USING (public.is_admin(auth.uid()));

CREATE POLICY "enrollments_student_read" ON public.competition_enrollments FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
  OR
  coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid())
);

CREATE POLICY "appointments_read" ON public.competition_appointments FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
  OR
  coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid())
);

CREATE POLICY "appointments_student_insert" ON public.competition_appointments FOR INSERT WITH CHECK (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

CREATE POLICY "appointments_coach_update" ON public.competition_appointments FOR UPDATE USING (
  coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.generate_competition_groups(
  _competition_id uuid, _year integer, _month integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  groups_config jsonb[] := ARRAY[
    '{"num":1,"start":1, "end":6}'::jsonb,
    '{"num":2,"start":8, "end":13}'::jsonb,
    '{"num":3,"start":15,"end":20}'::jsonb,
    '{"num":4,"start":22,"end":27}'::jsonb
  ];
  cfg jsonb; istart date; iend date; final_dt date; award_dt date; last_final date; dow_offset integer;
BEGIN
  DELETE FROM public.competition_groups WHERE competition_id = _competition_id;
  last_final := make_date(_year, _month, 22) + 29;
  dow_offset := CASE EXTRACT(DOW FROM last_final)::integer
    WHEN 6 THEN 7 WHEN 0 THEN 6 WHEN 1 THEN 5 WHEN 2 THEN 4
    WHEN 3 THEN 3 WHEN 4 THEN 2 WHEN 5 THEN 1 ELSE 0 END;
  award_dt := last_final + dow_offset;
  FOREACH cfg IN ARRAY groups_config LOOP
    istart   := make_date(_year, _month, (cfg->>'start')::integer);
    iend     := make_date(_year, _month, (cfg->>'end')::integer);
    final_dt := istart + 29;
    INSERT INTO public.competition_groups (competition_id, group_number, initial_start_date, initial_end_date, final_weigh_in_date, award_date)
    VALUES (_competition_id, (cfg->>'num')::integer, istart, iend, final_dt,
            CASE WHEN (cfg->>'num')::integer = 4 THEN award_dt ELSE NULL END);
  END LOOP;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.generate_competition_groups(uuid,integer,integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.generate_competition_groups(uuid,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_competition_reminders()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE rec record; days_left integer; cnt integer := 0;
BEGIN
  FOR rec IN
    SELECT ce.id AS enrollment_id, ce.student_id, ce.final_date AS final_dt, s.profile_id,
      (ce.final_date - CURRENT_DATE) AS remaining
    FROM public.competition_enrollments ce
    JOIN public.students s ON s.id = ce.student_id
    WHERE ce.status IN ('enrolled','scheduled_initial','weighed_initial','scheduled_final')
      AND ce.initial_date IS NOT NULL
      AND ce.final_date > CURRENT_DATE
      AND ce.final_date <= CURRENT_DATE + 7
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.profile_id = s.profile_id AND n.type = 'competition_reminder'
          AND n.created_at::date = CURRENT_DATE
      )
  LOOP
    days_left := rec.remaining;
    INSERT INTO public.notifications (profile_id, type, title, message, action_url)
    VALUES (rec.profile_id, 'competition_reminder',
      '⚖️ Pesagem Final em ' || days_left || ' dia(s)!',
      'Sua pesagem final é no dia ' || to_char(rec.final_dt, 'DD/MM/YYYY') || '. Agende com seu coach e não perca o prazo!',
      '/student/challenge');
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enroll_student_in_competition(
  _student_id uuid, _gender text DEFAULT 'M'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_competition_id uuid; v_group_id uuid; v_coach_id uuid;
  v_today date := CURRENT_DATE;
  v_month integer := EXTRACT(MONTH FROM CURRENT_DATE);
  v_year  integer := EXTRACT(YEAR  FROM CURRENT_DATE);
  v_enrollment_id uuid;
BEGIN
  SELECT c.id INTO v_competition_id FROM public.competitions c
  WHERE c.month = v_month AND c.year = v_year AND c.status = 'active' LIMIT 1;
  IF v_competition_id IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.competition_enrollments WHERE student_id = _student_id AND competition_id = v_competition_id)
    THEN RETURN NULL; END IF;
  SELECT id INTO v_group_id FROM public.competition_groups
  WHERE competition_id = v_competition_id AND v_today BETWEEN initial_start_date AND initial_end_date LIMIT 1;
  IF v_group_id IS NULL THEN
    SELECT id INTO v_group_id FROM public.competition_groups
    WHERE competition_id = v_competition_id AND initial_start_date > v_today
    ORDER BY initial_start_date LIMIT 1;
  END IF;
  IF v_group_id IS NULL THEN RETURN NULL; END IF;
  SELECT coach_id INTO v_coach_id FROM public.students WHERE id = _student_id;
  INSERT INTO public.competition_enrollments (competition_id, group_id, student_id, coach_id, gender, enrolled_by)
  VALUES (v_competition_id, v_group_id, _student_id, v_coach_id, _gender, 'system')
  RETURNING id INTO v_enrollment_id;
  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  SELECT p.id, 'competition_enrolled',
    '🏆 Você foi inscrito no Desafio!',
    'Sua inscrição no Desafio de Emagrecimento foi confirmada. Agende sua pesagem inicial com seu coach!',
    '/student/challenge'
  FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE s.id = _student_id;
  RETURN v_enrollment_id;
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.enroll_student_in_competition(uuid,text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.enroll_student_in_competition(uuid,text) TO authenticated;
