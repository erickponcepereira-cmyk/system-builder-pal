-- FitMind Club — base da Parte 3

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS referral_commission_percentage DECIMAL(5,2) DEFAULT 50.00;

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS is_referral BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS referred_by_student_id UUID REFERENCES public.students(id);

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20) UNIQUE,
  ADD COLUMN IF NOT EXISTS referral_link TEXT,
  ADD COLUMN IF NOT EXISTS completed_coach_course BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS coach_course_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coach_account_created_at TIMESTAMPTZ;

ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS inactive_since DATE,
  ADD COLUMN IF NOT EXISTS inactivity_warning_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS transferred_to_coach_id UUID REFERENCES public.coaches(id),
  ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.generate_student_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    NEW.referral_code := upper(substring(md5(NEW.id::text || clock_timestamp()::text) from 1 for 8));
  END IF;
  IF NEW.referral_link IS NULL OR NEW.referral_link = '' THEN
    NEW.referral_link := '/r/' || NEW.referral_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_student_referral_code ON public.students;
CREATE TRIGGER set_student_referral_code
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.generate_student_referral_code();

UPDATE public.students
SET referral_code = upper(substring(md5(id::text) from 1 for 8))
WHERE referral_code IS NULL;

UPDATE public.students
SET referral_link = '/r/' || referral_code
WHERE referral_link IS NULL AND referral_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.student_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE UNIQUE NOT NULL,
  available_balance DECIMAL(12,2) DEFAULT 0,
  pending_balance DECIMAL(12,2) DEFAULT 0,
  total_earned DECIMAL(12,2) DEFAULT 0,
  total_withdrawn DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.student_wallets ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.student_withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  pix_key VARCHAR(255),
  pix_key_type VARCHAR(20),
  bank_name VARCHAR(100),
  bank_agency VARCHAR(20),
  bank_account VARCHAR(30),
  bank_account_type VARCHAR(20),
  holder_name VARCHAR(255),
  holder_cpf VARCHAR(14),
  status public.withdrawal_status DEFAULT 'requested',
  requested_at TIMESTAMPTZ DEFAULT now(),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT
);

ALTER TABLE public.student_withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_student_wallet()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.student_wallets (student_id)
  VALUES (NEW.id)
  ON CONFLICT (student_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_student_created_create_wallet ON public.students;
CREATE TRIGGER on_student_created_create_wallet
  AFTER INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.create_student_wallet();

INSERT INTO public.student_wallets (student_id)
SELECT id FROM public.students
ON CONFLICT (student_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.bioimpedance_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  evaluated_by_coach_id UUID REFERENCES public.coaches(id) NOT NULL,
  evaluation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  evaluation_type VARCHAR(20) NOT NULL,
  scale_number VARCHAR(50),
  weighing_class VARCHAR(100),
  weight DECIMAL(5,2),
  bmi DECIMAL(5,2),
  fat_percentage DECIMAL(5,2),
  muscle_percentage DECIMAL(5,2),
  visceral_fat INTEGER,
  resting_metabolism INTEGER,
  body_age INTEGER,
  bmi_classification VARCHAR(50),
  bmi_health_risk TEXT,
  fat_classification VARCHAR(20),
  muscle_classification VARCHAR(20),
  visceral_fat_classification VARCHAR(30),
  weight_delta DECIMAL(5,2),
  fat_delta DECIMAL(5,2),
  muscle_delta DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.bioimpedance_evaluations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.anamnesis_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  filled_at TIMESTAMPTZ DEFAULT now(),
  profession VARCHAR(100),
  marital_status VARCHAR(50),
  preexisting_conditions TEXT,
  surgical_history TEXT,
  current_medications TEXT,
  supplements_used TEXT,
  food_allergies TEXT,
  protocol_reason TEXT,
  objective VARCHAR(50),
  dietary_goals JSONB DEFAULT '[]'::jsonb,
  dietary_goals_other TEXT,
  food_diary JSONB DEFAULT '[]'::jsonb,
  fast_food_frequency TEXT,
  special_dietary_habits TEXT,
  water_intake_daily VARCHAR(50),
  exercises_regularly BOOLEAN,
  exercise_level VARCHAR(20),
  exercise_type TEXT,
  exercise_time VARCHAR(50),
  exercise_duration VARCHAR(50),
  exercise_since VARCHAR(50),
  sleep_hours VARCHAR(50),
  stress_level TEXT,
  stress_strategies TEXT,
  alcohol_consumption BOOLEAN,
  alcohol_frequency TEXT,
  tobacco_consumption BOOLEAN,
  tobacco_quantity TEXT,
  disliked_foods TEXT,
  additional_observations TEXT,
  student_signature_confirmed BOOLEAN DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ
);

ALTER TABLE public.anamnesis_forms ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.challenge_awards_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  category VARCHAR(50) NOT NULL,
  gender VARCHAR(10) NOT NULL,
  placement INTEGER NOT NULL,
  award_description TEXT,
  award_value DECIMAL(12,2),
  badge_icon VARCHAR(50),
  badge_color VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, category, gender, placement)
);

ALTER TABLE public.challenge_awards_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.coach_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_coach_id UUID REFERENCES public.coaches(id) NOT NULL,
  to_coach_id UUID REFERENCES public.coaches(id) NOT NULL,
  reason TEXT,
  students_transferred INTEGER DEFAULT 0,
  coaches_transferred INTEGER DEFAULT 0,
  performed_by UUID REFERENCES public.profiles(id),
  transferred_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.coach_transfers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.digital_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  instructor VARCHAR(100),
  cover_url TEXT,
  price DECIMAL(12,2) NOT NULL,
  original_price DECIMAL(12,2),
  duration_hours DECIMAL(5,1),
  access_days INTEGER DEFAULT 365,
  content_url TEXT,
  is_featured BOOLEAN DEFAULT FALSE,
  status VARCHAR(20) DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.digital_products ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.digital_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  digital_product_id UUID REFERENCES public.digital_products(id) NOT NULL,
  amount_paid DECIMAL(12,2),
  purchased_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ,
  access_url TEXT
);

ALTER TABLE public.digital_purchases ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  attended BOOLEAN DEFAULT TRUE,
  activity_type VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(student_id, log_date, activity_type)
);

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.motivational_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote TEXT NOT NULL,
  author VARCHAR(100),
  category VARCHAR(50) DEFAULT 'general',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.motivational_quotes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.daily_quote_delivery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  quote_id UUID REFERENCES public.motivational_quotes(id) ON DELETE CASCADE NOT NULL,
  delivered_date DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(student_id, delivered_date)
);

ALTER TABLE public.daily_quote_delivery ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.push_notifications_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  data JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) DEFAULT 'pending'
);

ALTER TABLE public.push_notifications_queue ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS student_wallets_admin_all ON public.student_wallets;
CREATE POLICY student_wallets_admin_all ON public.student_wallets FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS student_wallets_own_select ON public.student_wallets;
CREATE POLICY student_wallets_own_select ON public.student_wallets FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS student_withdrawals_admin_all ON public.student_withdrawal_requests;
CREATE POLICY student_withdrawals_admin_all ON public.student_withdrawal_requests FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS student_withdrawals_own_select ON public.student_withdrawal_requests;
CREATE POLICY student_withdrawals_own_select ON public.student_withdrawal_requests FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);
DROP POLICY IF EXISTS student_withdrawals_own_insert ON public.student_withdrawal_requests;
CREATE POLICY student_withdrawals_own_insert ON public.student_withdrawal_requests FOR INSERT WITH CHECK (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS bio_admin_all ON public.bioimpedance_evaluations;
CREATE POLICY bio_admin_all ON public.bioimpedance_evaluations FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS bio_student_own_select ON public.bioimpedance_evaluations;
CREATE POLICY bio_student_own_select ON public.bioimpedance_evaluations FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);
DROP POLICY IF EXISTS bio_coach_students_all ON public.bioimpedance_evaluations;
CREATE POLICY bio_coach_students_all ON public.bioimpedance_evaluations FOR ALL USING (
  evaluated_by_coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid())
) WITH CHECK (
  evaluated_by_coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS anamnesis_admin_all ON public.anamnesis_forms;
CREATE POLICY anamnesis_admin_all ON public.anamnesis_forms FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS anamnesis_student_own_all ON public.anamnesis_forms;
CREATE POLICY anamnesis_student_own_all ON public.anamnesis_forms FOR ALL USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
) WITH CHECK (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);
DROP POLICY IF EXISTS anamnesis_coach_students_select ON public.anamnesis_forms;
CREATE POLICY anamnesis_coach_students_select ON public.anamnesis_forms FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s WHERE s.coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid()))
);

DROP POLICY IF EXISTS challenge_awards_admin_all ON public.challenge_awards_config;
CREATE POLICY challenge_awards_admin_all ON public.challenge_awards_config FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS challenge_awards_read_authenticated ON public.challenge_awards_config;
CREATE POLICY challenge_awards_read_authenticated ON public.challenge_awards_config FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS coach_transfers_admin_all ON public.coach_transfers;
CREATE POLICY coach_transfers_admin_all ON public.coach_transfers FOR ALL USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS digital_products_admin_all ON public.digital_products;
CREATE POLICY digital_products_admin_all ON public.digital_products FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS digital_products_read_active ON public.digital_products;
CREATE POLICY digital_products_read_active ON public.digital_products FOR SELECT TO authenticated USING (status = 'active');

DROP POLICY IF EXISTS digital_purchases_admin_all ON public.digital_purchases;
CREATE POLICY digital_purchases_admin_all ON public.digital_purchases FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS digital_purchases_own_select ON public.digital_purchases;
CREATE POLICY digital_purchases_own_select ON public.digital_purchases FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS attendance_admin_all ON public.attendance_logs;
CREATE POLICY attendance_admin_all ON public.attendance_logs FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS attendance_student_own_select ON public.attendance_logs;
CREATE POLICY attendance_student_own_select ON public.attendance_logs FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);
DROP POLICY IF EXISTS attendance_coach_students_all ON public.attendance_logs;
CREATE POLICY attendance_coach_students_all ON public.attendance_logs FOR ALL USING (
  student_id IN (SELECT s.id FROM public.students s WHERE s.coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid()))
) WITH CHECK (
  student_id IN (SELECT s.id FROM public.students s WHERE s.coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid()))
);

DROP POLICY IF EXISTS motivational_quotes_admin_all ON public.motivational_quotes;
CREATE POLICY motivational_quotes_admin_all ON public.motivational_quotes FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS motivational_quotes_read_active ON public.motivational_quotes;
CREATE POLICY motivational_quotes_read_active ON public.motivational_quotes FOR SELECT TO authenticated USING (is_active = true);

DROP POLICY IF EXISTS daily_quote_admin_all ON public.daily_quote_delivery;
CREATE POLICY daily_quote_admin_all ON public.daily_quote_delivery FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS daily_quote_own_select ON public.daily_quote_delivery;
CREATE POLICY daily_quote_own_select ON public.daily_quote_delivery FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS push_queue_admin_all ON public.push_notifications_queue;
CREATE POLICY push_queue_admin_all ON public.push_notifications_queue FOR ALL USING (public.is_admin(auth.uid()));
DROP POLICY IF EXISTS push_queue_own_select ON public.push_notifications_queue;
CREATE POLICY push_queue_own_select ON public.push_notifications_queue FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

-- Initial content
INSERT INTO public.motivational_quotes (quote, author, category)
SELECT * FROM (VALUES
('Cada passo conta. Cada escolha importa. Você está mais perto do que imagina.', 'FitMind Club', 'mindset'),
('O corpo alcança o que a mente acredita.', 'Desconhecido', 'mindset'),
('Não é sobre perfeição, é sobre progresso constante.', 'FitMind Club', 'consistency'),
('Seu futuro eu está te agradecendo por cada treino de hoje.', 'FitMind Club', 'fitness'),
('A disciplina é a ponte entre os seus objetivos e as suas conquistas.', 'Jim Rohn', 'mindset'),
('Cuide do seu corpo. É o único lugar que você tem para viver.', 'Jim Rohn', 'fitness'),
('A maior vitória é a que começa dentro de você.', 'FitMind Club', 'mindset'),
('30 dias de decisão. Uma vida de transformação.', 'FitMind Club', 'fitness'),
('Você não precisa ser perfeito. Você precisa ser consistente.', 'FitMind Club', 'consistency'),
('O primeiro passo é o mais difícil. Você já deu. Continue.', 'FitMind Club', 'mindset'),
('Alimentar bem o corpo é um ato de amor próprio.', 'FitMind Club', 'nutrition'),
('Pequenas mudanças diárias resultam em grandes transformações.', 'FitMind Club', 'consistency'),
('Força não é o que você pode fazer. É superar o que você achava que não podia.', 'FitMind Club', 'fitness'),
('Seu único competidor é a versão de ontem de você mesmo.', 'FitMind Club', 'mindset'),
('A jornada de mil milhas começa com um único passo.', 'Lao Tsé', 'consistency'),
('Quando você sentir vontade de desistir, lembre-se por que começou.', 'FitMind Club', 'mindset'),
('Saúde é investimento, não despesa.', 'FitMind Club', 'fitness'),
('Cada refeição saudável é uma vitória.', 'FitMind Club', 'nutrition'),
('O sucesso é a soma de pequenos esforços repetidos dia após dia.', 'Robert Collier', 'consistency'),
('Transformação começa na mente, antes de aparecer no corpo.', 'FitMind Club', 'mindset')
) AS q(quote, author, category)
WHERE NOT EXISTS (SELECT 1 FROM public.motivational_quotes mq WHERE mq.quote = q.quote);

INSERT INTO public.digital_products (type, title, description, instructor, price, access_days, is_featured, status)
SELECT 'course', 'Curso de Coach FitMind Club', 'Aprenda tudo sobre como ser um coach de sucesso: técnicas de captação, acompanhamento de alunos, uso da plataforma e estratégias de crescimento de rede.', 'Equipe FitMind Club', 197.00, 365, true, 'active'
WHERE NOT EXISTS (SELECT 1 FROM public.digital_products WHERE title = 'Curso de Coach FitMind Club');