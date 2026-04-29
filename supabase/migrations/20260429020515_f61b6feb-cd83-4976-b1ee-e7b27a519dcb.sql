CREATE TABLE IF NOT EXISTS public.store_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL UNIQUE DEFAULT ('FM-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method public.payment_method NOT NULL DEFAULT 'pix',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  payment_fee NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  shipping_name TEXT,
  shipping_phone TEXT,
  shipping_zip TEXT,
  shipping_address TEXT,
  shipping_city TEXT,
  shipping_state TEXT,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.store_orders(id) ON DELETE CASCADE,
  product_kind TEXT NOT NULL,
  product_id UUID,
  digital_product_id UUID,
  store_product_id UUID,
  title TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  total_price NUMERIC NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_orders_student_id ON public.store_orders(student_id);
CREATE INDEX IF NOT EXISTS idx_store_orders_status ON public.store_orders(status);
CREATE INDEX IF NOT EXISTS idx_store_order_items_order_id ON public.store_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON public.attendance_logs(student_id, log_date);

ALTER TABLE public.store_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS store_orders_admin_all ON public.store_orders;
CREATE POLICY store_orders_admin_all ON public.store_orders FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS store_orders_student_select ON public.store_orders;
CREATE POLICY store_orders_student_select ON public.store_orders FOR SELECT USING (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS store_orders_student_insert ON public.store_orders;
CREATE POLICY store_orders_student_insert ON public.store_orders FOR INSERT WITH CHECK (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS store_order_items_admin_all ON public.store_order_items;
CREATE POLICY store_order_items_admin_all ON public.store_order_items FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS store_order_items_student_select ON public.store_order_items;
CREATE POLICY store_order_items_student_select ON public.store_order_items FOR SELECT USING (
  order_id IN (SELECT o.id FROM public.store_orders o JOIN public.students s ON s.id = o.student_id JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

DROP POLICY IF EXISTS attendance_student_own_insert ON public.attendance_logs;
CREATE POLICY attendance_student_own_insert ON public.attendance_logs FOR INSERT WITH CHECK (
  student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid())
);

CREATE OR REPLACE FUNCTION public.touch_store_order_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_store_orders_updated_at ON public.store_orders;
CREATE TRIGGER update_store_orders_updated_at
BEFORE UPDATE ON public.store_orders
FOR EACH ROW
EXECUTE FUNCTION public.touch_store_order_updated_at();

CREATE OR REPLACE FUNCTION public.create_store_order(
  _items JSONB,
  _payment_method public.payment_method DEFAULT 'pix',
  _shipping JSONB DEFAULT '{}'::jsonb,
  _notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id UUID;
  current_student_id UUID;
  fallback_product_id UUID;
  order_id UUID;
  item JSONB;
  item_kind TEXT;
  item_id UUID;
  item_title TEXT;
  item_price NUMERIC;
  item_qty INTEGER;
  subtotal NUMERIC := 0;
  payment_fee NUMERIC := 0;
  tax_amount NUMERIC := 0;
  total NUMERIC := 0;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;
  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  SELECT id INTO fallback_product_id FROM public.products WHERE status = 'active' ORDER BY sort_order NULLS LAST, created_at LIMIT 1;

  INSERT INTO public.store_orders (student_id, payment_method, shipping_name, shipping_phone, shipping_zip, shipping_address, shipping_city, shipping_state, notes)
  VALUES (
    current_student_id,
    COALESCE(_payment_method, 'pix'),
    NULLIF(_shipping->>'name', ''),
    NULLIF(_shipping->>'phone', ''),
    NULLIF(_shipping->>'zip', ''),
    NULLIF(_shipping->>'address', ''),
    NULLIF(_shipping->>'city', ''),
    NULLIF(_shipping->>'state', ''),
    _notes
  ) RETURNING id INTO order_id;

  FOR item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    item_kind := item->>'kind';
    item_id := (item->>'sourceId')::UUID;
    item_qty := GREATEST(1, COALESCE((item->>'quantity')::INTEGER, 1));

    IF item_kind = 'challenge' THEN
      SELECT name, price INTO item_title, item_price FROM public.products WHERE id = item_id AND status = 'active';
    ELSIF item_kind = 'digital' THEN
      SELECT title, price INTO item_title, item_price FROM public.digital_products WHERE id = item_id AND status = 'active';
    ELSIF item_kind = 'store' THEN
      SELECT name, price INTO item_title, item_price FROM public.store_products WHERE id = item_id AND status = 'active' AND COALESCE(stock, 0) >= item_qty;
      UPDATE public.store_products SET stock = GREATEST(0, COALESCE(stock, 0) - item_qty) WHERE id = item_id;
    ELSE
      RAISE EXCEPTION 'Tipo de item inválido';
    END IF;

    IF item_title IS NULL THEN
      RAISE EXCEPTION 'Item indisponível';
    END IF;

    INSERT INTO public.store_order_items (order_id, product_kind, product_id, digital_product_id, store_product_id, title, quantity, unit_price, total_price)
    VALUES (
      order_id,
      item_kind,
      CASE WHEN item_kind = 'challenge' THEN item_id ELSE NULL END,
      CASE WHEN item_kind = 'digital' THEN item_id ELSE NULL END,
      CASE WHEN item_kind = 'store' THEN item_id ELSE NULL END,
      item_title,
      item_qty,
      item_price,
      item_price * item_qty
    );

    subtotal := subtotal + (item_price * item_qty);
  END LOOP;

  payment_fee := ROUND(subtotal * CASE COALESCE(_payment_method, 'pix') WHEN 'pix' THEN 0.01 WHEN 'debit_card' THEN 0.0169 ELSE 0.0299 END, 2);
  tax_amount := ROUND(subtotal * 0.06, 2);
  total := subtotal + payment_fee + tax_amount;

  UPDATE public.store_orders
  SET subtotal = subtotal,
      payment_fee = payment_fee,
      tax_amount = tax_amount,
      total_amount = total
  WHERE id = order_id;

  INSERT INTO public.transactions (student_id, product_id, gross_amount, payment_fee, tax_amount, net_amount, payment_method, installments, status, purchase_type, metadata)
  VALUES (current_student_id, fallback_product_id, total, payment_fee, tax_amount, GREATEST(0, subtotal - payment_fee - tax_amount), COALESCE(_payment_method, 'pix'), 1, 'pending', 'store_order', jsonb_build_object('store_order_id', order_id));

  RETURN order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_check_in(_activity_type TEXT DEFAULT 'challenge', _notes TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id UUID;
  current_student_id UUID;
  active_subscription_id UUID;
  log_id UUID;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;
  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  SELECT id INTO active_subscription_id
  FROM public.subscriptions
  WHERE student_id = current_student_id AND status = 'active' AND end_date >= CURRENT_DATE
  ORDER BY end_date DESC
  LIMIT 1;

  INSERT INTO public.attendance_logs (student_id, subscription_id, log_date, attended, activity_type, notes)
  VALUES (current_student_id, active_subscription_id, CURRENT_DATE, TRUE, COALESCE(_activity_type, 'challenge'), _notes)
  ON CONFLICT (student_id, log_date, activity_type)
  DO UPDATE SET attended = TRUE, notes = COALESCE(EXCLUDED.notes, public.attendance_logs.notes)
  RETURNING id INTO log_id;

  RETURN log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_student_attendance_summary(_student_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_student_id UUID;
  total_days INTEGER := 30;
  attended_days INTEGER := 0;
BEGIN
  IF _student_id IS NULL THEN
    SELECT s.id INTO target_student_id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid();
  ELSE
    target_student_id := _student_id;
  END IF;

  IF target_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF NOT public.is_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE s.id = target_student_id AND p.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM public.students s JOIN public.coaches c ON c.id = s.coach_id JOIN public.profiles p ON p.id = c.profile_id WHERE s.id = target_student_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COUNT(DISTINCT log_date)::INTEGER INTO attended_days
  FROM public.attendance_logs
  WHERE student_id = target_student_id AND attended = TRUE AND log_date >= CURRENT_DATE - INTERVAL '29 days';

  RETURN jsonb_build_object('attended_days', attended_days, 'total_days', total_days, 'percentage', LEAST(100, ROUND((attended_days::NUMERIC / total_days) * 100)));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_store_order(JSONB, public.payment_method, JSONB, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.student_check_in(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_student_attendance_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_order(JSONB, public.payment_method, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_check_in(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_attendance_summary(UUID) TO authenticated;