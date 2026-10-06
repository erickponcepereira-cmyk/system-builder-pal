-- Cobrança agrupada: um pagamento para vários pedidos do mesmo carrinho.
--
-- Cada produto de parceiro/profissional vira um pedido próprio (cada um carrega
-- a sua cadeia de comissão e o seu repasse), e o checkout cobrava um pedido por
-- vez: um carrinho com 32 exames eram 32 pagamentos. Em 05/10/2026 a venda da
-- Andressa (33doctor) teve de ser cobrada por link fora do sistema e lançada à
-- mão (ver docs/contexto/fitmind-financeiro.md, "Venda manual").
--
-- Os pedidos continuam separados — o rateio de cada um não muda. O que passa a
-- existir é a cobrança que os junta: o Mercado Pago recebe uma origem
-- `checkout_group:<id>`, e a aprovação aprova cada pedido dela como se tivesse
-- sido pago sozinho. Estorno continua por pedido.
CREATE TABLE IF NOT EXISTS public.checkout_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_number text NOT NULL UNIQUE DEFAULT ('CG-' || upper(substr(md5(gen_random_uuid()::text), 1, 8))),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  total_amount numeric(12,2) NOT NULL CHECK (total_amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('pix', 'card')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  mp_payment_id uuid,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.checkout_group_items (
  group_id uuid NOT NULL REFERENCES public.checkout_groups(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('store_order', 'partner_product_order')),
  source_id uuid NOT NULL,
  amount numeric(12,2) NOT NULL,
  PRIMARY KEY (group_id, source_kind, source_id)
);
CREATE INDEX IF NOT EXISTS checkout_group_items_source_idx ON public.checkout_group_items (source_kind, source_id);

ALTER TABLE public.checkout_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkout_group_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_groups, public.checkout_group_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.checkout_groups, public.checkout_group_items TO authenticated;
GRANT ALL ON public.checkout_groups, public.checkout_group_items TO service_role;

-- Só lê quem compra, quem montou a venda e o admin. Escrita só pela função abaixo.
DROP POLICY IF EXISTS checkout_groups_select ON public.checkout_groups;
CREATE POLICY checkout_groups_select ON public.checkout_groups
  FOR SELECT TO authenticated
  USING (student_id = public.current_student_id()
         OR created_by_profile_id = public.current_profile_id()
         OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS checkout_group_items_select ON public.checkout_group_items;
CREATE POLICY checkout_group_items_select ON public.checkout_group_items
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.checkout_groups g
                  WHERE g.id = group_id
                    AND (g.student_id = public.current_student_id()
                         OR g.created_by_profile_id = public.current_profile_id()
                         OR public.is_admin(auth.uid()))));

-- Junta pedidos já criados numa cobrança só. Confere, para cada pedido: que
-- existe, que ainda espera pagamento, que é do mesmo aluno, que tem o mesmo
-- meio de pagamento, que quem chama pode cobrá-lo (o próprio aluno, o coach que
-- montou a venda ou admin) e que não está em outra cobrança aberta.
CREATE OR REPLACE FUNCTION public.create_checkout_group(_refs jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_coach uuid := public.current_coach_id();
  v_my_student uuid := public.current_student_id();
  v_is_admin boolean := COALESCE(public.is_admin(auth.uid()), false);
  r jsonb;
  v_kind text;
  v_id uuid;
  v_student uuid;
  v_item_student uuid;
  v_status text;
  v_amount numeric;
  v_method text;
  v_creator text;
  v_group_method text;
  v_total numeric := 0;
  v_group uuid;
  v_number text;
BEGIN
  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'Entre na sua conta para pagar';
  END IF;
  IF jsonb_typeof(_refs) IS DISTINCT FROM 'array' OR jsonb_array_length(_refs) < 2 THEN
    RAISE EXCEPTION 'A cobrança agrupada precisa de pelo menos dois pedidos';
  END IF;

  FOR r IN SELECT value FROM jsonb_array_elements(_refs) LOOP
    v_kind := r->>'kind';
    v_id := (r->>'id')::uuid;
    v_item_student := NULL;

    IF v_kind = 'partner_product_order' THEN
      SELECT o.student_id, o.status, o.gross_amount, o.payment_method, o.metadata->>'created_by_coach_id'
        INTO v_item_student, v_status, v_amount, v_method, v_creator
        FROM partner_product_orders o WHERE o.id = v_id FOR UPDATE;
    ELSIF v_kind = 'store_order' THEN
      SELECT o.student_id, o.status, o.total_amount,
             CASE WHEN o.payment_method::text = 'pix' THEN 'pix' ELSE 'card' END,
             o.metadata->>'created_by_coach_id'
        INTO v_item_student, v_status, v_amount, v_method, v_creator
        FROM store_orders o WHERE o.id = v_id FOR UPDATE;
    ELSE
      RAISE EXCEPTION 'Tipo de pedido não aceito na cobrança: %', v_kind;
    END IF;

    IF v_item_student IS NULL THEN
      RAISE EXCEPTION 'Pedido não encontrado';
    END IF;
    IF v_status <> 'pending' THEN
      RAISE EXCEPTION 'Um dos pedidos não está mais aguardando pagamento';
    END IF;
    IF NOT v_is_admin
       AND v_item_student IS DISTINCT FROM v_my_student
       AND (v_coach IS NULL OR v_creator IS DISTINCT FROM v_coach::text) THEN
      RAISE EXCEPTION 'Você não pode cobrar este pedido';
    END IF;

    IF v_student IS NULL THEN
      v_student := v_item_student;
    ELSIF v_student <> v_item_student THEN
      RAISE EXCEPTION 'Os pedidos são de clientes diferentes';
    END IF;

    IF v_group_method IS NULL THEN
      v_group_method := v_method;
    ELSIF v_group_method <> v_method THEN
      RAISE EXCEPTION 'Os pedidos têm meios de pagamento diferentes';
    END IF;

    IF EXISTS (SELECT 1 FROM checkout_group_items i JOIN checkout_groups g ON g.id = i.group_id
                WHERE i.source_kind = v_kind AND i.source_id = v_id AND g.status = 'pending') THEN
      RAISE EXCEPTION 'Um dos pedidos já está em outra cobrança aberta';
    END IF;

    v_total := v_total + v_amount;
  END LOOP;

  INSERT INTO checkout_groups (student_id, created_by_profile_id, total_amount, payment_method)
  VALUES (v_student, v_profile, round(v_total, 2), v_group_method)
  RETURNING id, group_number INTO v_group, v_number;

  INSERT INTO checkout_group_items (group_id, source_kind, source_id, amount)
  SELECT v_group, x->>'kind', (x->>'id')::uuid,
         CASE x->>'kind'
           WHEN 'partner_product_order' THEN (SELECT gross_amount FROM partner_product_orders WHERE id = (x->>'id')::uuid)
           ELSE (SELECT total_amount FROM store_orders WHERE id = (x->>'id')::uuid)
         END
    FROM jsonb_array_elements(_refs) x;

  RETURN jsonb_build_object('id', v_group, 'number', v_number, 'total', round(v_total, 2),
                            'count', jsonb_array_length(_refs));
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_checkout_group(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_checkout_group(jsonb) TO authenticated, service_role;

-- O Mercado Pago passa a aceitar a cobrança agrupada como origem.
ALTER TABLE public.mercadopago_payments DROP CONSTRAINT IF EXISTS mercadopago_payments_source_kind_check;
ALTER TABLE public.mercadopago_payments ADD CONSTRAINT mercadopago_payments_source_kind_check
  CHECK (source_kind = ANY (ARRAY['store_order'::text, 'transaction'::text, 'partner_product_order'::text,
                                  'subscription_invoice'::text, 'checkout_group'::text]));

-- Meio de pagamento escolhido na hora vale para cada pedido da cobrança.
CREATE OR REPLACE FUNCTION public.sync_source_payment_method_from_mp(_kind text, _id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_method text;
  v_alvo   text;
  r        record;
BEGIN
  SELECT m.payment_method INTO v_method
    FROM public.mercadopago_payments m
   WHERE m.source_kind = _kind AND m.source_id = _id AND m.status = 'approved'
   ORDER BY m.created_at DESC LIMIT 1;

  IF v_method IS NULL THEN RETURN; END IF;
  v_alvo := CASE WHEN v_method = 'credit_card' THEN 'card' ELSE v_method END;

  IF _kind = 'store_order' THEN
    UPDATE public.store_orders
       SET payment_method = v_method::public.payment_method
     WHERE id = _id AND payment_method::text IS DISTINCT FROM v_method;

  ELSIF _kind = 'partner_product_order' THEN
    UPDATE public.partner_product_orders
       SET payment_method = v_alvo
     WHERE id = _id AND payment_method IS DISTINCT FROM v_alvo;

    IF FOUND THEN
      PERFORM public.admin_reprocess_partner_order(_id);
    END IF;

  ELSIF _kind = 'checkout_group' THEN
    FOR r IN SELECT source_kind, source_id FROM public.checkout_group_items WHERE group_id = _id LOOP
      IF r.source_kind = 'store_order' THEN
        UPDATE public.store_orders
           SET payment_method = v_method::public.payment_method
         WHERE id = r.source_id AND payment_method::text IS DISTINCT FROM v_method;
      ELSE
        UPDATE public.partner_product_orders
           SET payment_method = v_alvo
         WHERE id = r.source_id AND payment_method IS DISTINCT FROM v_alvo;
        IF FOUND THEN
          PERFORM public.admin_reprocess_partner_order(r.source_id);
        END IF;
      END IF;
    END LOOP;
  END IF;
END;
$function$;
