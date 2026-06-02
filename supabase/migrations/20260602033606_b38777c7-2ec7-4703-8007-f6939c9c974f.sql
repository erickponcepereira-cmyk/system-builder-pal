
CREATE TABLE public.network_unlock_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  period_year INTEGER NOT NULL,
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  patent_level INTEGER NOT NULL DEFAULT 1,
  multiplier INTEGER NOT NULL DEFAULT 1,
  total_sales INTEGER NOT NULL DEFAULT 0,
  any_completed BOOLEAN NOT NULL DEFAULT false,
  -- snapshot: [{ id, label, product_type, required_base, required_scaled, current, completed, missing }, ...]
  goals_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, period_year, period_month)
);

CREATE INDEX idx_nuh_period ON public.network_unlock_history (period_year DESC, period_month DESC);
CREATE INDEX idx_nuh_profile ON public.network_unlock_history (profile_id);

GRANT SELECT ON public.network_unlock_history TO authenticated;
GRANT ALL ON public.network_unlock_history TO service_role;

ALTER TABLE public.network_unlock_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nuh_select_own"
  ON public.network_unlock_history FOR SELECT
  USING (profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

CREATE POLICY "nuh_admin_all"
  ON public.network_unlock_history FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_nuh_updated_at
  BEFORE UPDATE ON public.network_unlock_history
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
