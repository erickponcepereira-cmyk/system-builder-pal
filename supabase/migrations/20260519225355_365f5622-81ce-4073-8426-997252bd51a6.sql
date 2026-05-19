-- 1) Tabela de comissão extra do Master Coach (10% da comissão do vendedor)
CREATE TABLE IF NOT EXISTS public.master_coach_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID REFERENCES public.store_orders(id) ON DELETE CASCADE,
  product_id UUID,
  seller_coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  master_coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  is_cross_sale BOOLEAN NOT NULL DEFAULT false,
  base_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
  master_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcc_master ON public.master_coach_commissions(master_coach_id);
CREATE INDEX IF NOT EXISTS idx_mcc_seller ON public.master_coach_commissions(seller_coach_id);

ALTER TABLE public.master_coach_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin vê tudo MCC" ON public.master_coach_commissions
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Coach envolvido vê MCC" ON public.master_coach_commissions
FOR SELECT TO authenticated USING (
  master_coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
  OR seller_coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);

-- 2) Tabela de atribuição de Nutricionista Parceiro por venda
CREATE TABLE IF NOT EXISTS public.sale_nutritionist_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
  seller_coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  nutritionist_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  assignment_method TEXT NOT NULL DEFAULT 'auto_upline',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);

ALTER TABLE public.sale_nutritionist_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin vê tudo SNA" ON public.sale_nutritionist_assignments
FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
);
CREATE POLICY "Coach envolvido vê SNA" ON public.sale_nutritionist_assignments
FOR SELECT TO authenticated USING (
  seller_coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid()
  )
  OR nutritionist_coach_id IN (
    SELECT c.id FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid()
  )
);

-- 3) Helper: caminha a upline procurando o coach mais próximo com a medalha dada
CREATE OR REPLACE FUNCTION public.find_upline_with_badge(_coach_id UUID, _badge public.coach_badge_key)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  current_id UUID := _coach_id;
  next_id UUID;
  steps INT := 0;
BEGIN
  WHILE current_id IS NOT NULL AND steps < 20 LOOP
    IF EXISTS (
      SELECT 1 FROM public.coach_badges
      WHERE coach_id = current_id AND badge_key = _badge
    ) THEN
      RETURN current_id;
    END IF;
    SELECT upline_coach_id INTO next_id FROM public.coaches WHERE id = current_id;
    current_id := next_id;
    steps := steps + 1;
  END LOOP;
  RETURN NULL;
END;
$$;

-- 4) Helpers nomeados (açúcar sintático)
CREATE OR REPLACE FUNCTION public.find_master_coach_for(_coach_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.find_upline_with_badge(_coach_id, 'master_coach'::public.coach_badge_key);
$$;

CREATE OR REPLACE FUNCTION public.find_nutritionist_for(_coach_id UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.find_upline_with_badge(_coach_id, 'nutritionist_partner'::public.coach_badge_key);
$$;