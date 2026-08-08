CREATE OR REPLACE FUNCTION public.renovar_pedido_recorrente(
  _student_id uuid,
  _product_kind text,
  _product_id uuid,
  _amount numeric DEFAULT NULL,
  _mp_payment_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_base public.partner_product_orders%ROWTYPE;
  v_new_id uuid;
BEGIN
  IF _student_id IS NULL OR _product_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_base
    FROM public.partner_product_orders o
   WHERE o.student_id = _student_id
     AND o.status = 'paid'
     AND (
       (_product_kind = 'professional_product' AND o.professional_product_id = _product_id)
       OR (_product_kind = 'partner_product' AND o.partner_product_id = _product_id)
     )
   ORDER BY o.paid_at DESC NULLS LAST, o.created_at DESC
   LIMIT 1;

  IF v_base.id IS NULL THEN RETURN NULL; END IF;

  v_base.id := gen_random_uuid();
  v_base.order_number := 'PP-' || upper(substr(gen_random_uuid()::text, 1, 8));
  v_base.status := 'paid';
  v_base.paid_at := now();
  v_base.cancelled_at := NULL;
  v_base.created_at := now();
  v_base.updated_at := now();
  v_base.mp_payment_id := NULL;
  v_base.available_at := NULL;
  v_base.release_base_at := NULL;
  v_base.release_status := 'pending';
  v_base.delivery_started_at := NULL;
  v_base.wallet_debit_breakdown := NULL;
  v_base.payment_method := 'credit_card';
  v_base.notes := 'Renovação automática da assinatura';
  v_base.metadata := COALESCE(v_base.metadata, '{}'::jsonb)
                     || jsonb_build_object('renovacao', true, 'mp_payment_id', _mp_payment_id);
  IF _amount IS NOT NULL AND _amount > 0 THEN
    v_base.gross_amount := _amount;
  END IF;

  INSERT INTO public.partner_product_orders VALUES (v_base.*) RETURNING id INTO v_new_id;
  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.renovar_pedido_recorrente(uuid, text, uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renovar_pedido_recorrente(uuid, text, uuid, numeric, text) TO service_role;