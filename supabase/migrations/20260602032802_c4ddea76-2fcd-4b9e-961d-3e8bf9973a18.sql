
-- Network unlock rules: which categories (product types) participate and minimum sales count
CREATE TABLE public.network_unlock_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  -- NULL = "categoria geral" (counts ANY paid sale)
  product_type product_type NULL,
  required_sales INTEGER NOT NULL DEFAULT 1 CHECK (required_sales > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.network_unlock_rules TO anon, authenticated;
GRANT ALL ON public.network_unlock_rules TO service_role;

ALTER TABLE public.network_unlock_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "network_unlock_rules_read_all"
  ON public.network_unlock_rules FOR SELECT
  USING (true);

CREATE POLICY "network_unlock_rules_admin_all"
  ON public.network_unlock_rules FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_network_unlock_rules_updated_at
  BEFORE UPDATE ON public.network_unlock_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default rules based on user's spec
INSERT INTO public.network_unlock_rules (label, product_type, required_sales, sort_order, description) VALUES
  ('Protocolo 30 dias', 'plan_30', 1, 10, 'Venda 1 protocolo de 30 dias no mês'),
  ('Desafio', 'challenge', 3, 20, 'Venda 3 desafios no mês'),
  ('Curso', 'digital_course', 1, 30, 'Venda 1 curso digital no mês'),
  ('Categoria Geral (qualquer venda)', NULL, 7, 99, 'Atinja 7 vendas no total, de qualquer categoria');
