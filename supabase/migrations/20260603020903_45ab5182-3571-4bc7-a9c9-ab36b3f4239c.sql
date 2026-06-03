ALTER TABLE public.patent_rules
  ADD COLUMN IF NOT EXISTS phase smallint,
  ADD COLUMN IF NOT EXISTS vp_max_pct numeric(5,2),
  ADD COLUMN IF NOT EXISTS ve_max_pct numeric(5,2);

-- Remove previous active set and re-seed
DELETE FROM public.patent_rules
 WHERE key IN ('coach_explorer','coach_builder','coach_contributor','coach_influencer','coach_mentor','coach_strategist','coach_leader','coach_master','coach_architect','coach_visionary','coach_legacy','coach_guardian')
    OR key IN ('explorador','contribuidor','construtor','realizador','influenciador','pioneiro','estrategista','arquiteto','expansor','lider','mentor','master','navegador','visionario','catalisador','embaixador','presidente','tita','legado','guardiao','circulo_fundadores');

INSERT INTO public.patent_rules
  (key, display_name, badge_color, badge_icon, level, phase, required_revenue, time_window_months, min_own_sales_pct, max_team_sales_pct, vp_max_pct, ve_max_pct, sort_order, is_active, description, patent)
VALUES
 ('explorador','Coach Explorador','#9CA3AF','compass',1,1,0,1,100,0,100,0,1,true,'Cadastro e integração concluída',NULL),
 ('contribuidor','Coach Contribuidor','#CD7F32','medal',2,1,2500,1,100,0,100,0,2,true,'R$ 2.500 de produção',NULL),
 ('construtor','Coach Construtor','#CD7F32','medal',3,1,5000,1,100,0,100,0,3,true,'R$ 5.000 de produção',NULL),
 ('realizador','Coach Realizador','#CD7F32','medal',4,2,7500,1,50,50,50,50,4,true,'R$ 7.500 em 1 mês',NULL),
 ('influenciador','Coach Influenciador','#C0C0C0','medal',5,2,10000,1,50,50,50,50,5,true,'R$ 10.000 em 1 mês',NULL),
 ('pioneiro','Coach Pioneiro','#C0C0C0','medal',6,2,20000,6,60,40,60,40,6,true,'R$ 20.000 em 6 meses',NULL),
 ('estrategista','Coach Estrategista','#C0C0C0','medal',7,2,30000,6,50,50,50,50,7,true,'R$ 30.000 em 6 meses',NULL),
 ('arquiteto','Coach Arquiteto','#FFD700','medal',8,2,40000,6,30,70,30,70,8,true,'R$ 40.000 em 6 meses',NULL),
 ('expansor','Coach Expansor','#FFD700','medal',9,2,50000,12,60,40,60,40,9,true,'R$ 50.000 em 12 meses',NULL),
 ('lider','Coach Líder','#FF6B35','medal',10,2,65000,12,46,54,46,54,10,true,'R$ 65.000 em 12 meses',NULL),
 ('mentor','Coach Mentor','#FF6B35','medal',11,2,85000,12,42,58,42,58,11,true,'R$ 85.000 em 12 meses',NULL),
 ('master','Coach Master','#FFD700','crown',12,2,100000,12,42,58,42,58,12,true,'R$ 100.000 em 12 meses',NULL),
 ('navegador','Coach Navegador','#3B82F6','compass',13,3,150000,12,28,72,28,72,13,true,'R$ 150.000 em 12 meses',NULL),
 ('visionario','Coach Visionário','#3B82F6','eye',14,3,225000,12,18.7,81.3,18.7,81.3,14,true,'R$ 225.000 em 12 meses',NULL),
 ('catalisador','Coach Catalisador','#3B82F6','zap',15,3,325000,12,13,87,13,87,15,true,'R$ 325.000 em 12 meses',NULL),
 ('embaixador','Coach Embaixador','#8B5CF6','globe',16,3,500000,12,8.2,91.8,8.2,91.8,16,true,'R$ 500.000 em 12 meses',NULL),
 ('presidente','Coach Presidente','#8B5CF6','briefcase',17,3,750000,12,5.3,94.7,5.3,94.7,17,true,'R$ 750.000 em 12 meses',NULL),
 ('tita','Coach Titã','#EAB308','mountain',18,4,1000000,12,3.8,96.2,3.8,96.2,18,true,'R$ 1.000.000 em 12 meses',NULL),
 ('legado','Coach Legado','#EAB308','crown',19,4,1500000,12,2.5,97.5,2.5,97.5,19,true,'R$ 1.500.000 em 12 meses',NULL),
 ('guardiao','Coach Guardião','#EAB308','shield',20,4,2500000,12,1.4,98.6,1.4,98.6,20,true,'R$ 2.500.000 em 12 meses',NULL),
 ('circulo_fundadores','Coach Círculo dos Fundadores','#FFD700','star',21,4,5000000,12,0.6,99.4,0.6,99.4,21,true,'R$ 5.000.000 em 12 meses',NULL);

CREATE TABLE IF NOT EXISTS public.coach_medals_individual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  medal_kind text NOT NULL CHECK (medal_kind IN ('monthly','cumulative')),
  medal_key text NOT NULL,
  period_year smallint,
  period_month smallint,
  vp_amount numeric(14,2) NOT NULL DEFAULT 0,
  awarded_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS coach_medals_individual_uq
  ON public.coach_medals_individual (coach_id, medal_kind, medal_key, COALESCE(period_year,0), COALESCE(period_month,0));

GRANT SELECT ON public.coach_medals_individual TO authenticated;
GRANT ALL ON public.coach_medals_individual TO service_role;

ALTER TABLE public.coach_medals_individual ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_medals_read_own_or_admin" ON public.coach_medals_individual;
CREATE POLICY "coach_medals_read_own_or_admin" ON public.coach_medals_individual
  FOR SELECT TO authenticated USING (
    coach_id IN (
      SELECT c.id FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
    OR is_admin(auth.uid())
  );

CREATE TABLE IF NOT EXISTS public.career_medal_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('monthly','cumulative')),
  key text NOT NULL,
  display_name text NOT NULL,
  threshold numeric(14,2) NOT NULL,
  tier text,
  icon text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, key)
);

GRANT SELECT ON public.career_medal_rules TO authenticated;
GRANT ALL ON public.career_medal_rules TO service_role;

ALTER TABLE public.career_medal_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "career_medal_rules_read_all" ON public.career_medal_rules;
DROP POLICY IF EXISTS "career_medal_rules_admin_all" ON public.career_medal_rules;
CREATE POLICY "career_medal_rules_read_all" ON public.career_medal_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "career_medal_rules_admin_all" ON public.career_medal_rules
  FOR ALL TO authenticated USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

INSERT INTO public.career_medal_rules (kind, key, display_name, threshold, tier, icon, sort_order) VALUES
  ('monthly','contribuidor','Medalha Contribuidor',2500,'bronze','medal',1),
  ('monthly','construtor','Medalha Construtor',5000,'bronze','medal',2),
  ('monthly','realizador','Medalha Realizador',7500,'bronze','medal',3),
  ('monthly','influenciador','Medalha Influenciador',10000,'silver','medal',4),
  ('monthly','pioneiro','Medalha Pioneiro',20000,'silver','medal',5),
  ('monthly','estrategista','Medalha Estrategista',30000,'silver','medal',6),
  ('monthly','arquiteto','Medalha Arquiteto',40000,'gold','medal',7),
  ('monthly','expansor','Medalha Expansor',50000,'gold','medal',8),
  ('monthly','lider','Medalha Líder',65000,'platinum','medal',9),
  ('monthly','mentor','Medalha Mentor',85000,'platinum','medal',10),
  ('monthly','master','Medalha Master',100000,'crown','crown',11),
  ('cumulative','clube_100k','Clube 100K',100000,'club','trophy',1),
  ('cumulative','clube_250k','Clube 250K',250000,'club','trophy',2),
  ('cumulative','clube_500k','Clube 500K',500000,'club','trophy',3),
  ('cumulative','clube_1m','Clube 1 Milhão',1000000,'club','trophy',4),
  ('cumulative','clube_2_5m','Clube 2,5 Milhões',2500000,'club','trophy',5),
  ('cumulative','clube_5m','Clube 5 Milhões',5000000,'club','trophy',6),
  ('cumulative','clube_10m','Clube 10 Milhões',10000000,'club','trophy',7)
ON CONFLICT (kind, key) DO NOTHING;