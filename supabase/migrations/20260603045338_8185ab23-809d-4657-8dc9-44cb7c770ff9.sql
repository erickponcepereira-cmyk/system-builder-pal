-- Adiciona referrer_student_id em store_orders e transactions para rastrear quem indicou a venda
ALTER TABLE public.store_orders
  ADD COLUMN IF NOT EXISTS referrer_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS referrer_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_store_orders_referrer_student
  ON public.store_orders(referrer_student_id)
  WHERE referrer_student_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_referrer_student
  ON public.transactions(referrer_student_id)
  WHERE referrer_student_id IS NOT NULL;