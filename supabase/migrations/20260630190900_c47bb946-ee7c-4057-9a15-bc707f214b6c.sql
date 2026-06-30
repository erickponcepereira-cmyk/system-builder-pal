CREATE OR REPLACE FUNCTION public.postpone_subscription_invoice(_invoice_id uuid, _new_due_date date, _performed_by uuid)
 RETURNS subscription_invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         status     = CASE WHEN _new_due_date >= CURRENT_DATE THEN 'pending'::invoice_status ELSE status END,
         updated_at = now()
   WHERE id = _invoice_id
   RETURNING * INTO inv;

  INSERT INTO public.subscription_payment_log(invoice_id, user_id, action, performed_by, details)
  VALUES (inv.id, inv.user_id, 'postponed', _performed_by,
          jsonb_build_object('previous_due_date', v_old_due, 'new_due_date', _new_due_date));

  RETURN inv;
END;
$function$;