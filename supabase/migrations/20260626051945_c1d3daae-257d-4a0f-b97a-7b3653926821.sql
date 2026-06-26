
-- Reverter pagamento ou isenção de uma fatura de mensalidade
CREATE OR REPLACE FUNCTION public.revert_subscription_invoice_payment(
  _invoice_id uuid,
  _performed_by uuid
)
RETURNS public.subscription_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.subscription_invoices;
  v_net numeric := 0;
BEGIN
  SELECT * INTO inv FROM public.subscription_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada'; END IF;
  IF inv.status NOT IN ('paid','exempted') THEN
    RAISE EXCEPTION 'Apenas faturas pagas ou isentas podem ser desfeitas';
  END IF;

  v_net := COALESCE(inv.net_to_admin, 0);

  -- Estorna saldo da carteira do admin pelo líquido creditado
  IF v_net > 0 THEN
    UPDATE public.admin_system_wallet
       SET available_balance = GREATEST(0, available_balance - v_net),
           total_earned      = GREATEST(0, total_earned - v_net),
           updated_at        = now()
     WHERE id = TRUE;
  END IF;

  -- Remove TODAS as entradas vinculadas à fatura (crédito + linhas de taxa/imposto)
  DELETE FROM public.admin_system_wallet_entries
   WHERE subscription_invoice_id = _invoice_id;

  -- Volta a fatura para pendente
  UPDATE public.subscription_invoices
     SET status         = 'pending',
         paid_at        = NULL,
         payment_method = NULL,
         wallet_source  = NULL,
         fee_amount     = 0,
         tax_amount     = 0,
         net_to_admin   = 0,
         mp_payment_id  = NULL,
         updated_at     = now()
   WHERE id = _invoice_id
   RETURNING * INTO inv;

  INSERT INTO public.subscription_payment_log(invoice_id, user_id, action, performed_by, details)
  VALUES (inv.id, inv.user_id, 'reverted', _performed_by,
          jsonb_build_object('previous_net', v_net));

  RETURN inv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_subscription_invoice_payment(uuid, uuid) TO authenticated, service_role;

-- Adiar vencimento de uma fatura (mantém pendente)
CREATE OR REPLACE FUNCTION public.postpone_subscription_invoice(
  _invoice_id uuid,
  _new_due_date date,
  _performed_by uuid
)
RETURNS public.subscription_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.subscription_invoices;
  v_old_due date;
BEGIN
  SELECT * INTO inv FROM public.subscription_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada'; END IF;
  IF inv.status IN ('paid','exempted','cancelled') THEN
    RAISE EXCEPTION 'Não é possível adiar uma fatura já paga, isenta ou cancelada';
  END IF;

  v_old_due := inv.due_date;

  UPDATE public.subscription_invoices
     SET due_date   = _new_due_date,
         status     = CASE WHEN _new_due_date >= CURRENT_DATE THEN 'pending'::subscription_invoice_status ELSE status END,
         updated_at = now()
   WHERE id = _invoice_id
   RETURNING * INTO inv;

  INSERT INTO public.subscription_payment_log(invoice_id, user_id, action, performed_by, details)
  VALUES (inv.id, inv.user_id, 'postponed', _performed_by,
          jsonb_build_object('previous_due_date', v_old_due, 'new_due_date', _new_due_date));

  RETURN inv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.postpone_subscription_invoice(uuid, date, uuid) TO authenticated, service_role;

-- Restaurar a data de vencimento padrão (com base no dia de cobrança da assinatura)
CREATE OR REPLACE FUNCTION public.reset_subscription_invoice_due_date(
  _invoice_id uuid,
  _performed_by uuid
)
RETURNS public.subscription_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.subscription_invoices;
  v_billing_day int;
  v_default_due date;
BEGIN
  SELECT * INTO inv FROM public.subscription_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Fatura não encontrada'; END IF;

  SELECT billing_day INTO v_billing_day
    FROM public.user_subscriptions WHERE id = inv.user_subscription_id;
  IF v_billing_day IS NULL THEN v_billing_day := 5; END IF;

  v_default_due := (date_trunc('month', inv.reference_month)::date + (v_billing_day - 1));

  PERFORM public.postpone_subscription_invoice(_invoice_id, v_default_due, _performed_by);

  SELECT * INTO inv FROM public.subscription_invoices WHERE id = _invoice_id;
  RETURN inv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_subscription_invoice_due_date(uuid, uuid) TO authenticated, service_role;
