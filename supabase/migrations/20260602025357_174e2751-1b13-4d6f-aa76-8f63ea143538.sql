
-- Extend patent_rules to support the new FitMind Career system
ALTER TABLE public.patent_rules
  ADD COLUMN IF NOT EXISTS key TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS required_revenue NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS time_window_months INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS min_own_sales_pct NUMERIC(5,2) DEFAULT 100,
  ADD COLUMN IF NOT EXISTS max_team_sales_pct NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS level INTEGER;

-- Allow the legacy 'patent' enum column to be NULL for new entries
ALTER TABLE public.patent_rules ALTER COLUMN patent DROP NOT NULL;

-- Unique key for new rows
CREATE UNIQUE INDEX IF NOT EXISTS patent_rules_key_unique ON public.patent_rules (key) WHERE key IS NOT NULL;

-- Mark legacy rows as inactive (kept for historical reference)
UPDATE public.patent_rules SET is_active = false WHERE key IS NULL;

-- Seed the 12 official FitMind patents
INSERT INTO public.patent_rules
  (key, display_name, description, badge_color, badge_icon,
   required_revenue, time_window_months, min_own_sales_pct, max_team_sales_pct,
   level, sort_order, is_active, benefits,
   min_direct_students, min_network_students, min_monthly_revenue, min_consecutive_months,
   can_access_reports, report_scope)
VALUES
  ('coach_explorer',    'Coach Explorer',    'Realizar cadastro e concluir a integração inicial na FitMind.', '#9CA3AF', 'compass',
     0,        1,  100, 0,   1, 101, true, '', 0,0,0,0, false,'own'),
  ('coach_builder',     'Coach Builder',     'Movimentar R$ 2.500 em vendas próprias dentro do mês.',          '#10B981', 'hammer',
     2500,     1,  100, 0,   2, 102, true, '', 0,0,0,0, false,'own'),
  ('coach_contributor', 'Coach Contributor', 'Movimentar R$ 5.000 em vendas próprias dentro do mês.',          '#22C55E', 'hand-coins',
     5000,     1,  100, 0,   3, 103, true, '', 0,0,0,0, false,'own'),
  ('coach_influencer',  'Coach Influencer',  'Movimentar R$ 7.500 com no mínimo 50% em vendas próprias.',      '#3B82F6', 'megaphone',
     7500,     1,  50,  50,  4, 104, true, '', 0,0,0,0, false,'own'),
  ('coach_mentor',      'Coach Mentor',      'Movimentar R$ 10.000 com no mínimo 50% em vendas próprias.',     '#6366F1', 'graduation-cap',
     10000,    1,  50,  50,  5, 105, true, '', 0,0,0,0, false,'own'),
  ('coach_strategist',  'Coach Strategist',  'Movimentar R$ 20.000 acumulados em até 6 meses (mín 50% próprias).','#8B5CF6','target',
     20000,    6,  50,  50,  6, 106, true, '', 0,0,0,0, false,'own'),
  ('coach_leader',      'Coach Leader',      'Movimentar R$ 30.000 acumulados em até 6 meses (mín 50% próprias).','#A855F7','flag',
     30000,    6,  50,  50,  7, 107, true, '', 0,0,0,0, false,'own'),
  ('coach_master',      'Coach Master',      'Movimentar R$ 40.000 acumulados em até 6 meses (mín 50% próprias).','#EC4899','medal',
     40000,    6,  50,  50,  8, 108, true, '', 0,0,0,0, false,'own'),
  ('coach_architect',   'Coach Architect',   'Movimentar R$ 50.000 acumulados em até 12 meses (mín 30% próprias).','#F59E0B','building',
     50000,    12, 30,  70,  9, 109, true, '', 0,0,0,0, false,'own'),
  ('coach_visionary',   'Coach Visionary',   'Movimentar R$ 65.000 acumulados em até 12 meses (mín 30% próprias).','#F97316','eye',
     65000,    12, 30,  70,  10,110, true, '', 0,0,0,0, false,'own'),
  ('coach_legacy',      'Coach Legacy',      'Movimentar R$ 85.000 acumulados em até 12 meses (mín 30% próprias).','#EF4444','gem',
     85000,    12, 30,  70,  11,111, true, '', 0,0,0,0, false,'own'),
  ('coach_guardian',    'Coach Guardian',    'Movimentar R$ 100.000 acumulados em até 12 meses (mín 30% próprias).','#EAB308','crown',
     100000,   12, 30,  70,  12,112, true, '', 0,0,0,0, false,'own')
ON CONFLICT (key) WHERE key IS NOT NULL DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  badge_color = EXCLUDED.badge_color,
  badge_icon = EXCLUDED.badge_icon,
  required_revenue = EXCLUDED.required_revenue,
  time_window_months = EXCLUDED.time_window_months,
  min_own_sales_pct = EXCLUDED.min_own_sales_pct,
  max_team_sales_pct = EXCLUDED.max_team_sales_pct,
  level = EXCLUDED.level,
  sort_order = EXCLUDED.sort_order,
  is_active = true;
