-- Bypass de pagamento FitMindShape para Nutricionista Parceiro (igual ao Conselho)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS free_for_nutritionist BOOLEAN NOT NULL DEFAULT false;

-- Helper: o coach tem bypass de pagamento do FitMindShape?
-- (true se possui medalha de Conselho OU Nutricionista Parceiro)
CREATE OR REPLACE FUNCTION public.coach_has_fitmindshape_bypass(_coach_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.coach_badges
    WHERE coach_id = _coach_id
      AND badge_key IN ('council', 'nutritionist_partner')
  );
$$;

-- Helper: o coach pode acessar este produto grátis?
CREATE OR REPLACE FUNCTION public.coach_gets_product_free(_coach_id UUID, _product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.products p
    LEFT JOIN public.coach_badges cb ON cb.coach_id = _coach_id
    WHERE p.id = _product_id
      AND (
        (p.free_for_council AND cb.badge_key = 'council')
        OR (p.free_for_nutritionist AND cb.badge_key = 'nutritionist_partner')
      )
  );
$$;