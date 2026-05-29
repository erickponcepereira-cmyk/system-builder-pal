
ALTER TABLE public.competition_groups
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

ALTER TABLE public.competition_groups ALTER COLUMN group_number DROP NOT NULL;
ALTER TABLE public.competition_groups ALTER COLUMN initial_start_date DROP NOT NULL;
ALTER TABLE public.competition_groups ALTER COLUMN initial_end_date DROP NOT NULL;
ALTER TABLE public.competition_groups ALTER COLUMN final_weigh_in_date DROP NOT NULL;

ALTER TABLE public.competition_enrollments
  ADD COLUMN IF NOT EXISTS initial_body_fat numeric,
  ADD COLUMN IF NOT EXISTS final_body_fat numeric,
  ADD COLUMN IF NOT EXISTS initial_muscle_mass numeric,
  ADD COLUMN IF NOT EXISTS final_muscle_mass numeric,
  ADD COLUMN IF NOT EXISTS initial_share_url text,
  ADD COLUMN IF NOT EXISTS final_share_url text,
  ADD COLUMN IF NOT EXISTS result_fat_pct_lost numeric,
  ADD COLUMN IF NOT EXISTS result_muscle_gain_pct numeric,
  ADD COLUMN IF NOT EXISTS result_kg_lost numeric;

CREATE OR REPLACE FUNCTION public.calc_competition_results()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.initial_weight IS NOT NULL AND NEW.final_weight IS NOT NULL THEN
    NEW.result_kg_lost := NEW.initial_weight - NEW.final_weight;
    NEW.result_kg := NEW.result_kg_lost;
    IF NEW.initial_weight > 0 THEN
      NEW.result_pct := ROUND(((NEW.initial_weight - NEW.final_weight) / NEW.initial_weight * 100)::numeric, 2);
    END IF;
  END IF;

  IF NEW.initial_body_fat IS NOT NULL AND NEW.final_body_fat IS NOT NULL AND NEW.initial_body_fat > 0 THEN
    NEW.result_fat_pct_lost := ROUND(((NEW.initial_body_fat - NEW.final_body_fat) / NEW.initial_body_fat * 100)::numeric, 2);
  END IF;

  IF NEW.initial_muscle_mass IS NOT NULL AND NEW.final_muscle_mass IS NOT NULL AND NEW.initial_muscle_mass > 0 THEN
    NEW.result_muscle_gain_pct := ROUND(((NEW.final_muscle_mass - NEW.initial_muscle_mass) / NEW.initial_muscle_mass * 100)::numeric, 2);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_competition_results ON public.competition_enrollments;
CREATE TRIGGER trg_competition_results
  BEFORE INSERT OR UPDATE OF initial_weight, final_weight, initial_body_fat, final_body_fat, initial_muscle_mass, final_muscle_mass
  ON public.competition_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.calc_competition_results();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='competition_groups' AND policyname='admin_manage_groups') THEN
    EXECUTE 'CREATE POLICY admin_manage_groups ON public.competition_groups FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()))';
  END IF;
END $$;
