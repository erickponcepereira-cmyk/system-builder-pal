
ALTER TABLE public.workout_plans ADD COLUMN IF NOT EXISTS letter TEXT;

CREATE TABLE IF NOT EXISTS public.personal_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL,
  title TEXT NOT NULL,
  target_days INTEGER NOT NULL CHECK (target_days > 0 AND target_days <= 365),
  started_at DATE NOT NULL DEFAULT (now()::date),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.personal_challenges TO authenticated;
GRANT ALL ON public.personal_challenges TO service_role;
ALTER TABLE public.personal_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Student manages own personal challenges" ON public.personal_challenges;
CREATE POLICY "Student manages own personal challenges" ON public.personal_challenges
  FOR ALL TO authenticated USING (student_id = auth.uid()) WITH CHECK (student_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.achievement_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  condition_type TEXT NOT NULL,
  condition_value INTEGER,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.achievement_catalog TO authenticated;
GRANT ALL ON public.achievement_catalog TO service_role;
ALTER TABLE public.achievement_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Everyone reads catalog" ON public.achievement_catalog;
CREATE POLICY "Everyone reads catalog" ON public.achievement_catalog FOR SELECT TO authenticated USING (active = true);
DROP POLICY IF EXISTS "Admins manage catalog" ON public.achievement_catalog;
CREATE POLICY "Admins manage catalog" ON public.achievement_catalog FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.achievement_catalog (code, title, description, icon, condition_type, condition_value, sort_order) VALUES
  ('first_workout','Primeiro Treino','Você concluiu seu primeiro treino!','🎯','workouts_count',1,10),
  ('7_workouts','7 Treinos','Sete treinos concluídos','🔥','workouts_count',7,20),
  ('30_workouts','30 Treinos','Trinta treinos concluídos','💪','workouts_count',30,30),
  ('100_workouts','100 Treinos','Cem treinos concluídos','👑','workouts_count',100,40),
  ('streak_7','Constância 7 dias','7 dias seguidos treinando','⚡','streak_days',7,50),
  ('streak_30','Constância 30 dias','30 dias seguidos treinando','🌟','streak_days',30,60),
  ('personal_challenge_done','Desafio Pessoal Concluído','Você bateu seu próprio desafio','🏆','personal_challenge_completed',1,70)
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS personal_challenges_touch ON public.personal_challenges;
CREATE TRIGGER personal_challenges_touch BEFORE UPDATE ON public.personal_challenges
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS achievement_catalog_touch ON public.achievement_catalog;
CREATE TRIGGER achievement_catalog_touch BEFORE UPDATE ON public.achievement_catalog
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
