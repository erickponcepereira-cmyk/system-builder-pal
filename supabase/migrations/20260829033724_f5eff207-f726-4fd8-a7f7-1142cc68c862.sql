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

  IF NEW.initial_body_fat IS NOT NULL AND NEW.final_body_fat IS NOT NULL THEN
    NEW.result_fat_pct_lost := ROUND((NEW.initial_body_fat - NEW.final_body_fat)::numeric, 2);
  END IF;

  IF NEW.initial_muscle_mass IS NOT NULL AND NEW.final_muscle_mass IS NOT NULL THEN
    NEW.result_muscle_gain_pct := ROUND((NEW.final_muscle_mass - NEW.initial_muscle_mass)::numeric, 2);
  END IF;

  RETURN NEW;
END;
$$;

UPDATE public.competition_enrollments
SET result_fat_pct_lost = CASE
      WHEN initial_body_fat IS NOT NULL AND final_body_fat IS NOT NULL
        THEN ROUND((initial_body_fat - final_body_fat)::numeric, 2)
      ELSE result_fat_pct_lost END,
    result_muscle_gain_pct = CASE
      WHEN initial_muscle_mass IS NOT NULL AND final_muscle_mass IS NOT NULL
        THEN ROUND((final_muscle_mass - initial_muscle_mass)::numeric, 2)
      ELSE result_muscle_gain_pct END
WHERE (initial_body_fat IS NOT NULL AND final_body_fat IS NOT NULL)
   OR (initial_muscle_mass IS NOT NULL AND final_muscle_mass IS NOT NULL);