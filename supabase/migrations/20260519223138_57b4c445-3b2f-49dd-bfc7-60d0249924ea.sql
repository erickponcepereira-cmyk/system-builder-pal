-- Phase 3: Student health goals (calories/day, activity factor) tied to FitMindShape data
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS daily_calories_goal numeric(7,2),
  ADD COLUMN IF NOT EXISTS activity_factor numeric(3,2) DEFAULT 1.40,
  ADD COLUMN IF NOT EXISTS health_goals_updated_at timestamp with time zone;

-- Trigger to track last update of health goals fields
CREATE OR REPLACE FUNCTION public.touch_student_health_goals()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.daily_calories_goal IS DISTINCT FROM OLD.daily_calories_goal
     OR NEW.goal_weight IS DISTINCT FROM OLD.goal_weight
     OR NEW.activity_factor IS DISTINCT FROM OLD.activity_factor THEN
    NEW.health_goals_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS students_health_goals_touch ON public.students;
CREATE TRIGGER students_health_goals_touch
BEFORE UPDATE ON public.students
FOR EACH ROW EXECUTE FUNCTION public.touch_student_health_goals();