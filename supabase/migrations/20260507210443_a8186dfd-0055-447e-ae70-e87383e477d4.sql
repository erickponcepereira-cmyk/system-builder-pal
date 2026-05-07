CREATE TABLE IF NOT EXISTS public.saved_payment_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  mp_customer_id text,
  mp_card_id text NOT NULL,
  payer_email text,
  cardholder_name text,
  brand text,
  last_four text,
  first_six text,
  expiration_month integer,
  expiration_year integer,
  payment_method_id text,
  issuer_id text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, mp_card_id)
);

CREATE INDEX IF NOT EXISTS idx_saved_payment_cards_student ON public.saved_payment_cards(student_id);

ALTER TABLE public.saved_payment_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_payment_cards_student_select ON public.saved_payment_cards;
CREATE POLICY saved_payment_cards_student_select
ON public.saved_payment_cards
FOR SELECT
USING (
  student_id IN (
    SELECT s.id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS saved_payment_cards_admin_all ON public.saved_payment_cards;
CREATE POLICY saved_payment_cards_admin_all
ON public.saved_payment_cards
FOR ALL
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

DROP TRIGGER IF EXISTS saved_payment_cards_set_updated ON public.saved_payment_cards;
CREATE TRIGGER saved_payment_cards_set_updated
BEFORE UPDATE ON public.saved_payment_cards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();