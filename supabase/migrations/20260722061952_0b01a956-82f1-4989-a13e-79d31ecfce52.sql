
-- 1) Audit table
CREATE TABLE IF NOT EXISTS public.subscription_invoice_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.subscription_invoices(id) ON DELETE CASCADE,
  actor_id UUID,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.subscription_invoice_audit TO authenticated;
GRANT ALL ON public.subscription_invoice_audit TO service_role;

ALTER TABLE public.subscription_invoice_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY sia_admin_all ON public.subscription_invoice_audit
  FOR ALL TO authenticated
  USING (current_user_is_admin())
  WITH CHECK (current_user_is_admin());

CREATE POLICY sia_self_select ON public.subscription_invoice_audit
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subscription_invoices si
    WHERE si.id = subscription_invoice_audit.invoice_id
      AND (si.user_id = auth.uid() OR current_user_is_admin())
  ));

CREATE INDEX IF NOT EXISTS idx_sia_invoice_created ON public.subscription_invoice_audit(invoice_id, created_at DESC);

-- 2) Log trigger on invoice changes
CREATE OR REPLACE FUNCTION public.log_subscription_invoice_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_meta jsonb := '{}'::jsonb;
  v_action text := 'update';
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.subscription_invoice_audit(invoice_id, actor_id, action, from_status, to_status, meta)
    VALUES (NEW.id, v_actor, 'created', NULL, NEW.status::text,
            jsonb_build_object('amount', NEW.amount, 'due_date', NEW.due_date, 'reference_month', NEW.reference_month));
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_action := 'status_change';
    v_meta := v_meta || jsonb_build_object('payment_method', NEW.payment_method, 'wallet_source', NEW.wallet_source);
  END IF;
  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    v_action := CASE WHEN v_action = 'update' THEN 'due_date_change' ELSE v_action END;
    v_meta := v_meta || jsonb_build_object('old_due_date', OLD.due_date, 'new_due_date', NEW.due_date);
  END IF;
  IF OLD.amount IS DISTINCT FROM NEW.amount THEN
    v_action := CASE WHEN v_action = 'update' THEN 'amount_change' ELSE v_action END;
    v_meta := v_meta || jsonb_build_object('old_amount', OLD.amount, 'new_amount', NEW.amount);
  END IF;

  IF v_action <> 'update' THEN
    INSERT INTO public.subscription_invoice_audit(invoice_id, actor_id, action, from_status, to_status, meta)
    VALUES (NEW.id, v_actor, v_action, OLD.status::text, NEW.status::text, v_meta);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_subscription_invoice_change ON public.subscription_invoices;
CREATE TRIGGER trg_log_subscription_invoice_change
AFTER INSERT OR UPDATE ON public.subscription_invoices
FOR EACH ROW EXECUTE FUNCTION public.log_subscription_invoice_change();

-- 3) Skip month function
CREATE OR REPLACE FUNCTION public.admin_skip_invoice(_invoice_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_current_status text;
BEGIN
  IF NOT current_user_is_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem pular faturas';
  END IF;

  SELECT status::text INTO v_current_status FROM public.subscription_invoices WHERE id = _invoice_id;
  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'Fatura não encontrada';
  END IF;
  IF v_current_status IN ('paid','exempted','cancelled') THEN
    RAISE EXCEPTION 'Fatura já está finalizada (%). Use Desfazer primeiro.', v_current_status;
  END IF;

  UPDATE public.subscription_invoices
     SET status = 'exempted',
         notes = COALESCE(NULLIF(_reason,''), 'Mês pulado pelo admin'),
         paid_at = now(),
         updated_at = now()
   WHERE id = _invoice_id;

  INSERT INTO public.subscription_invoice_audit(invoice_id, actor_id, action, from_status, to_status, meta)
  VALUES (_invoice_id, v_actor, 'skip_month', v_current_status, 'exempted',
          jsonb_build_object('reason', COALESCE(_reason,'Mês pulado pelo admin')));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_skip_invoice(uuid, text) TO authenticated;
