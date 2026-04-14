
-- ================================================
-- ENUMS
-- ================================================
CREATE TYPE public.user_role AS ENUM ('admin', 'director', 'manager', 'coach', 'student');
CREATE TYPE public.patent_level AS ENUM ('coach', 'senior_coach', 'manager', 'senior_manager', 'director', 'senior_director', 'master_director');
CREATE TYPE public.subscription_status AS ENUM ('active', 'expired', 'cancelled', 'pending_payment');
CREATE TYPE public.payment_method AS ENUM ('credit_card', 'debit_card', 'pix');
CREATE TYPE public.transaction_status AS ENUM ('pending', 'paid', 'failed', 'refunded', 'chargeback');
CREATE TYPE public.commission_status AS ENUM ('pending', 'available', 'withdrawn', 'cancelled');
CREATE TYPE public.withdrawal_status AS ENUM ('requested', 'approved', 'processing', 'paid', 'rejected');
CREATE TYPE public.chat_permission AS ENUM ('all_members', 'coaches_only', 'managers_only', 'admins_only');
CREATE TYPE public.product_type AS ENUM ('challenge', 'physical', 'herbalife');

-- ================================================
-- TABLES
-- ================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE NOT NULL,
  role public.user_role NOT NULL DEFAULT 'student',
  patent public.patent_level DEFAULT NULL,
  name VARCHAR(255) NOT NULL,
  cpf VARCHAR(14) UNIQUE,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  birthdate DATE,
  photo_url TEXT,
  bio TEXT,
  street VARCHAR(255),
  number VARCHAR(20),
  neighborhood VARCHAR(100),
  city VARCHAR(100),
  state VARCHAR(2),
  zip_code VARCHAR(9),
  status VARCHAR(20) DEFAULT 'active',
  report_permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.coaches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  pix_key VARCHAR(255),
  pix_key_type VARCHAR(20),
  bank_name VARCHAR(100),
  bank_agency VARCHAR(20),
  bank_account VARCHAR(30),
  bank_account_type VARCHAR(20),
  referral_code VARCHAR(20) UNIQUE NOT NULL,
  referral_link TEXT,
  upline_coach_id UUID REFERENCES public.coaches(id),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.profiles(id),
  total_active_students INTEGER DEFAULT 0,
  total_sales DECIMAL(12,2) DEFAULT 0,
  consecutive_months_as_top INTEGER DEFAULT 0,
  career_goal_progress JSONB DEFAULT '{}',
  herbalife_portal_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  coach_id UUID REFERENCES public.coaches(id) NOT NULL,
  referred_by_student_id UUID REFERENCES public.students(id),
  goal_description TEXT,
  goal_weight DECIMAL(5,2),
  current_weight DECIMAL(5,2),
  height DECIMAL(5,2),
  body_fat_percentage DECIMAL(5,2),
  muscle_mass DECIMAL(5,2),
  bone_mass DECIMAL(5,2),
  body_water_percentage DECIMAL(5,2),
  visceral_fat INTEGER,
  metabolic_age INTEGER,
  bmr DECIMAL(8,2),
  bioimpedance_date DATE,
  target_fat_percentage DECIMAL(5,2),
  target_muscle_mass DECIMAL(5,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.patent_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patent public.patent_level NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  badge_color VARCHAR(20) NOT NULL,
  badge_icon VARCHAR(50) NOT NULL,
  min_direct_students INTEGER DEFAULT 0,
  min_network_students INTEGER DEFAULT 0,
  min_monthly_revenue DECIMAL(12,2) DEFAULT 0,
  min_consecutive_months INTEGER DEFAULT 0,
  can_access_reports BOOLEAN DEFAULT FALSE,
  report_scope VARCHAR(20) DEFAULT 'own',
  benefits TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type public.product_type DEFAULT 'challenge',
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE,
  description TEXT,
  price DECIMAL(12,2) NOT NULL,
  original_price DECIMAL(12,2),
  duration_days INTEGER DEFAULT 30,
  image_url TEXT,
  app_fee DECIMAL(12,2) DEFAULT 0,
  app_fee_percentage DECIMAL(5,2) DEFAULT 0,
  credit_fee_percentage DECIMAL(5,2) DEFAULT 2.99,
  debit_fee_percentage DECIMAL(5,2) DEFAULT 1.69,
  pix_fee_percentage DECIMAL(5,2) DEFAULT 1.00,
  tax_percentage DECIMAL(5,2) DEFAULT 6.00,
  max_installments INTEGER DEFAULT 3,
  commission_coach DECIMAL(5,2) DEFAULT 50.00,
  commission_level1 DECIMAL(5,2) DEFAULT 15.00,
  commission_level2 DECIMAL(5,2) DEFAULT 5.00,
  commission_level3 DECIMAL(5,2) DEFAULT 3.00,
  commission_level4 DECIMAL(5,2) DEFAULT 0,
  commission_level5 DECIMAL(5,2) DEFAULT 0,
  feature_benefits_club BOOLEAN DEFAULT TRUE,
  feature_class_schedule BOOLEAN DEFAULT TRUE,
  feature_weight_tracking BOOLEAN DEFAULT TRUE,
  feature_challenge_tracker BOOLEAN DEFAULT TRUE,
  feature_winners_forum BOOLEAN DEFAULT TRUE,
  feature_awards BOOLEAN DEFAULT TRUE,
  feature_coach_chat BOOLEAN DEFAULT TRUE,
  feature_recipes BOOLEAN DEFAULT FALSE,
  feature_group_chat BOOLEAN DEFAULT TRUE,
  feature_calorie_ai BOOLEAN DEFAULT TRUE,
  feature_photo_evolution BOOLEAN DEFAULT TRUE,
  feature_bioimpedance BOOLEAN DEFAULT TRUE,
  feature_store BOOLEAN DEFAULT TRUE,
  feature_herbalife BOOLEAN DEFAULT TRUE,
  status VARCHAR(20) DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status public.subscription_status DEFAULT 'pending_payment',
  auto_renew BOOLEAN DEFAULT FALSE,
  payment_method_token TEXT,
  payment_method public.payment_method,
  installments INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES public.subscriptions(id),
  student_id UUID REFERENCES public.students(id) NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  gross_amount DECIMAL(12,2) NOT NULL,
  app_fee DECIMAL(12,2) DEFAULT 0,
  payment_fee DECIMAL(12,2) DEFAULT 0,
  tax_amount DECIMAL(12,2) DEFAULT 0,
  net_amount DECIMAL(12,2) NOT NULL,
  payment_method public.payment_method NOT NULL,
  installments INTEGER DEFAULT 1,
  status public.transaction_status DEFAULT 'pending',
  gateway_transaction_id VARCHAR(255),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.transactions(id) NOT NULL,
  beneficiary_profile_id UUID REFERENCES public.profiles(id) NOT NULL,
  beneficiary_coach_id UUID REFERENCES public.coaches(id),
  level INTEGER NOT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status public.commission_status DEFAULT 'pending',
  available_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE NOT NULL,
  available_balance DECIMAL(12,2) DEFAULT 0,
  pending_balance DECIMAL(12,2) DEFAULT 0,
  total_earned DECIMAL(12,2) DEFAULT 0,
  total_withdrawn DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  pix_key VARCHAR(255),
  pix_key_type VARCHAR(20),
  status public.withdrawal_status DEFAULT 'requested',
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  approved_by UUID REFERENCES public.profiles(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notes TEXT
);

CREATE TABLE public.weight_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id),
  log_date DATE NOT NULL,
  weight DECIMAL(5,2) NOT NULL,
  waist_cm DECIMAL(5,2),
  hip_cm DECIMAL(5,2),
  chest_cm DECIMAL(5,2),
  arm_cm DECIMAL(5,2),
  thigh_cm DECIMAL(5,2),
  photo_url TEXT,
  notes TEXT,
  type VARCHAR(20) DEFAULT 'regular',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.evolution_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) NOT NULL,
  subscription_id UUID REFERENCES public.subscriptions(id),
  photo_url TEXT NOT NULL,
  photo_date DATE NOT NULL,
  week_number INTEGER,
  caption TEXT,
  is_visible_to_coach BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.class_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  instructor VARCHAR(100),
  day_of_week INTEGER,
  scheduled_datetime TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 60,
  link TEXT,
  level VARCHAR(20) DEFAULT 'all',
  week_number INTEGER,
  is_live BOOLEAN DEFAULT TRUE,
  recording_url TEXT,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.challenge_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  cover_url TEXT,
  send_permission public.chat_permission DEFAULT 'all_members',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.challenge_groups(id) NOT NULL,
  profile_id UUID REFERENCES public.profiles(id) NOT NULL,
  role VARCHAR(20) DEFAULT 'member',
  is_muted BOOLEAN DEFAULT FALSE,
  muted_until TIMESTAMPTZ,
  muted_by UUID REFERENCES public.profiles(id),
  is_banned BOOLEAN DEFAULT FALSE,
  banned_by UUID REFERENCES public.profiles(id),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(group_id, profile_id)
);

CREATE TABLE public.group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.challenge_groups(id) NOT NULL,
  sender_profile_id UUID REFERENCES public.profiles(id) NOT NULL,
  content TEXT,
  media_url TEXT,
  media_type VARCHAR(20),
  reply_to_id UUID REFERENCES public.group_messages(id),
  is_deleted BOOLEAN DEFAULT FALSE,
  deleted_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.food_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) NOT NULL,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type VARCHAR(20) DEFAULT 'meal',
  photo_url TEXT,
  description TEXT,
  ai_analysis JSONB,
  manual_override BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.challenge_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id),
  edition_number INTEGER NOT NULL,
  edition_name VARCHAR(255),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  cover_url TEXT,
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.challenge_winners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID REFERENCES public.challenge_editions(id) NOT NULL,
  student_id UUID REFERENCES public.students(id) NOT NULL,
  placement INTEGER NOT NULL,
  initial_weight DECIMAL(5,2),
  final_weight DECIMAL(5,2),
  weight_loss DECIMAL(5,2),
  before_photo_url TEXT,
  after_photo_url TEXT,
  testimonial TEXT,
  award_description TEXT,
  award_value DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.career_plan_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_months INTEGER DEFAULT 6,
  min_monthly_students INTEGER DEFAULT 100,
  must_be_top_seller BOOLEAN DEFAULT TRUE,
  reward_description TEXT,
  reward_value DECIMAL(12,2) DEFAULT 6000.00,
  reward_details TEXT DEFAULT 'Viagem com tudo pago ao Nordeste',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.monthly_rankings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_month DATE NOT NULL,
  coach_id UUID REFERENCES public.coaches(id) NOT NULL,
  new_students INTEGER DEFAULT 0,
  renewed_students INTEGER DEFAULT 0,
  total_students INTEGER DEFAULT 0,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  ranking_position INTEGER,
  is_top_seller BOOLEAN DEFAULT FALSE,
  qualifies_for_career_plan BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(reference_month, coach_id)
);

CREATE TABLE public.career_plan_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES public.coaches(id) NOT NULL,
  career_plan_id UUID REFERENCES public.career_plan_config(id) NOT NULL,
  start_month DATE,
  consecutive_months_qualified INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  current_streak_active BOOLEAN DEFAULT FALSE,
  reward_earned BOOLEAN DEFAULT FALSE,
  reward_earned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(coach_id, career_plan_id)
);

CREATE TABLE public.store_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(12,2) NOT NULL,
  original_price DECIMAL(12,2),
  image_url TEXT,
  category VARCHAR(100),
  stock INTEGER DEFAULT 0,
  is_herbalife BOOLEAN DEFAULT FALSE,
  herbalife_product_code VARCHAR(50),
  status VARCHAR(20) DEFAULT 'active',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID REFERENCES public.profiles(id) NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  action_url TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  coach_id UUID REFERENCES public.coaches(id),
  source VARCHAR(100),
  referral_code VARCHAR(20),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.partner_benefits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  logo_url TEXT,
  description TEXT,
  discount_info VARCHAR(255),
  coupon_code VARCHAR(50),
  website_url TEXT,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================
-- SEED DATA
-- ================================================
INSERT INTO public.patent_rules (patent, display_name, badge_color, badge_icon, min_direct_students, min_network_students, min_monthly_revenue, can_access_reports, report_scope, benefits, sort_order) VALUES
('coach', 'Coach', '#F97316', 'flame', 0, 0, 0, FALSE, 'own', 'Acesso à sua rede e comissões', 1),
('senior_coach', 'Coach Senior', '#F59E0B', 'star', 10, 20, 850, FALSE, 'own', 'Badge especial, destaque no ranking', 2),
('manager', 'Gerente', '#10B981', 'shield', 25, 75, 3000, TRUE, 'team', 'Relatórios da equipe, acesso a métricas de rede', 3),
('senior_manager', 'Gerente Sênior', '#3B82F6', 'shield-check', 50, 200, 8000, TRUE, 'team', 'Todos os relatórios da equipe completa', 4),
('director', 'Diretor', '#8B5CF6', 'crown', 100, 500, 20000, TRUE, 'company', 'Relatórios globais (conforme permissão admin)', 5),
('senior_director', 'Diretor Sênior', '#EC4899', 'gem', 200, 1000, 50000, TRUE, 'company', 'Acesso total configurável pelo admin', 6),
('master_director', 'Master Diretor', '#EF4444', 'trophy', 500, 3000, 150000, TRUE, 'company', 'Acesso completo à plataforma (exceto config)', 7);

INSERT INTO public.products (
  type, name, slug, description, price, duration_days, image_url,
  app_fee, credit_fee_percentage, debit_fee_percentage, pix_fee_percentage,
  tax_percentage, max_installments,
  commission_coach, commission_level1, commission_level2, commission_level3, status
) VALUES (
  'challenge', 'Desafio FitMind 30 Dias', 'desafio-fitmind-30-dias',
  'O desafio completo de transformação física e mental em 30 dias.',
  85.00, 30, 'https://images.unsplash.com/photo-1534258936925-c58bed479fcb?w=800',
  20.00, 2.99, 1.69, 1.00, 6.00, 3,
  50.00, 15.00, 5.00, 3.00, 'active'
);

INSERT INTO public.career_plan_config (name, description, duration_months, min_monthly_students, must_be_top_seller, reward_description, reward_value, reward_details) VALUES
('Desafio Top Performer', 'Seja o maior vendedor durante 6 meses consecutivos com 100+ inscrições por mês e ganhe uma viagem dos sonhos!', 6, 100, TRUE, 'Viagem com tudo pago para o Nordeste', 6000.00, 'Passagens aéreas, hotel 4 estrelas por 7 noites, passeios inclusos, alimentação no valor total de R$ 6.000,00');

INSERT INTO public.app_settings (key, value, description) VALUES
('app_name', 'FitChain', 'Nome da plataforma'),
('min_withdrawal_amount', '50', 'Valor mínimo para saque (R$)'),
('commission_release_days', '15', 'Dias para liberar comissão após pagamento'),
('max_mlm_levels', '3', 'Quantidade de níveis MLM ativos'),
('auto_renew_retry_days', '3', 'Dias de tentativa de cobrança no débito automático'),
('herbalife_base_url', 'https://www.herbalife.com.br', 'URL base do portal Herbalife'),
('career_plan_active', 'true', 'Plano de carreira ativo');

-- ================================================
-- FUNCTIONS & TRIGGERS
-- ================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'student')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-create wallet on profile creation
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.wallets (profile_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();

-- Security definer functions for RLS
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = _user_id AND role = 'admin')
$$;

-- ================================================
-- RLS POLICIES
-- ================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_own_select" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "profiles_own_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "profiles_own_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_admin_all" ON public.profiles FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.coaches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coaches_own_select" ON public.coaches FOR SELECT USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "coaches_own_update" ON public.coaches FOR UPDATE USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "coaches_admin_all" ON public.coaches FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students_own_select" ON public.students FOR SELECT USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "students_own_update" ON public.students FOR UPDATE USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "students_coach_select" ON public.students FOR SELECT USING (
  coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON c.profile_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "students_admin_all" ON public.students FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.patent_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "patent_rules_read_all" ON public.patent_rules FOR SELECT USING (true);
CREATE POLICY "patent_rules_admin_all" ON public.patent_rules FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products_read_all" ON public.products FOR SELECT USING (true);
CREATE POLICY "products_admin_all" ON public.products FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subscriptions_own" ON public.subscriptions FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON s.profile_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "subscriptions_admin_all" ON public.subscriptions FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transactions_admin_all" ON public.transactions FOR ALL USING (public.is_admin(auth.uid()));
CREATE POLICY "transactions_coach_select" ON public.transactions FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.coaches c ON s.coach_id = c.id JOIN public.profiles p ON c.profile_id = p.id WHERE p.user_id = auth.uid())
);

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "commissions_own" ON public.commissions FOR SELECT USING (
  beneficiary_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "commissions_admin_all" ON public.commissions FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wallets_own" ON public.wallets FOR SELECT USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "wallets_admin_all" ON public.wallets FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "withdrawals_own" ON public.withdrawal_requests FOR SELECT USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "withdrawals_own_insert" ON public.withdrawal_requests FOR INSERT WITH CHECK (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "withdrawals_admin_all" ON public.withdrawal_requests FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.weight_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "weight_logs_own" ON public.weight_logs FOR ALL USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON s.profile_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "weight_logs_admin_all" ON public.weight_logs FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.evolution_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "evolution_photos_own" ON public.evolution_photos FOR ALL USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON s.profile_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "evolution_photos_admin_all" ON public.evolution_photos FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.class_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "class_schedule_read_all" ON public.class_schedule FOR SELECT USING (true);
CREATE POLICY "class_schedule_admin_all" ON public.class_schedule FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.challenge_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "groups_read_all" ON public.challenge_groups FOR SELECT USING (true);
CREATE POLICY "groups_admin_all" ON public.challenge_groups FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_members_own" ON public.group_members FOR SELECT USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "group_members_admin_all" ON public.group_members FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_messages_member_select" ON public.group_messages FOR SELECT USING (
  group_id IN (SELECT gm.group_id FROM public.group_members gm JOIN public.profiles p ON gm.profile_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "group_messages_member_insert" ON public.group_messages FOR INSERT WITH CHECK (
  sender_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  AND group_id IN (SELECT gm.group_id FROM public.group_members gm JOIN public.profiles p ON gm.profile_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "group_messages_admin_all" ON public.group_messages FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.food_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "food_logs_own" ON public.food_logs FOR ALL USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON s.profile_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "food_logs_admin_all" ON public.food_logs FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.challenge_editions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "editions_read_all" ON public.challenge_editions FOR SELECT USING (true);
CREATE POLICY "editions_admin_all" ON public.challenge_editions FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.challenge_winners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "winners_read_all" ON public.challenge_winners FOR SELECT USING (true);
CREATE POLICY "winners_admin_all" ON public.challenge_winners FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.career_plan_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_plan_read_all" ON public.career_plan_config FOR SELECT USING (true);
CREATE POLICY "career_plan_admin_all" ON public.career_plan_config FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.monthly_rankings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rankings_read_all" ON public.monthly_rankings FOR SELECT USING (true);
CREATE POLICY "rankings_admin_all" ON public.monthly_rankings FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.career_plan_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "career_progress_own" ON public.career_plan_progress FOR SELECT USING (
  coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON c.profile_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "career_progress_admin_all" ON public.career_plan_progress FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.store_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "store_read_all" ON public.store_products FOR SELECT USING (true);
CREATE POLICY "store_admin_all" ON public.store_products FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_own" ON public.notifications FOR SELECT USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "notifications_own_update" ON public.notifications FOR UPDATE USING (
  profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);
CREATE POLICY "notifications_admin_all" ON public.notifications FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leads_coach_select" ON public.leads FOR SELECT USING (
  coach_id IN (SELECT c.id FROM public.coaches c JOIN public.profiles p ON c.profile_id = p.id WHERE p.user_id = auth.uid())
);
CREATE POLICY "leads_insert_all" ON public.leads FOR INSERT WITH CHECK (true);
CREATE POLICY "leads_admin_all" ON public.leads FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.partner_benefits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "benefits_read_all" ON public.partner_benefits FOR SELECT USING (true);
CREATE POLICY "benefits_admin_all" ON public.partner_benefits FOR ALL USING (public.is_admin(auth.uid()));

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read_all" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "settings_admin_all" ON public.app_settings FOR ALL USING (public.is_admin(auth.uid()));
