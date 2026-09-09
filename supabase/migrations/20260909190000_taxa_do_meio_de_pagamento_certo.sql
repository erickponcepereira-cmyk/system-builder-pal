-- Pedido pago no cartão estava sendo cobrado com a taxa do PIX.
--
-- O pedido nasce como PIX. Quando o Mercado Pago confirma que o cliente pagou
-- no cartão, `sync_source_payment_method_from_mp` troca o `payment_method` —
-- e só isso. A `payment_fee` continuava a do PIX. O Mercado Pago cobra a de
-- cartão, e a FitMind absorvia a diferença: R$ 174,96 em 8 dos 18 pedidos no
-- cartão entre 05/08 e 09/09/2026.
--
-- Agora a troca de método dispara o reprocessamento, que refaz a cascata com
-- a taxa certa. Só que `admin_reprocess_partner_order` tinha três defeitos
-- que precisavam sair antes de ela poder ser chamada sozinha:
--
--   1. `v_prod` era um record carregado só no ramo de produto PROFISSIONAL,
--      mas lido sempre. Todo pedido de produto de PARCEIRO morria em
--      "record v_prod is not assigned yet" — a função nunca funcionou para
--      metade do catálogo. Agora são escalares, e o produto é buscado na
--      tabela certa.
--   2. Ignorava os overrides: aplicava `sistema_pct` da tabela de taxas
--      mesmo em produto com `custom_split` e `system_fee_pct_override`.
--      Reprocessar um exame do Augustus trocaria os 15% dele pelos 7%
--      padrão, em silêncio.
--   3. Sobrescrevia `selling_coach_id` com o coach do aluno. Agora preserva
--      o vendedor original quando existe.
CREATE OR REPLACE FUNCTION public.sync_source_payment_method_from_mp(_kind text, _id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_method text;
  v_alvo   text;
BEGIN
  SELECT m.payment_method INTO v_method
    FROM public.mercadopago_payments m
   WHERE m.source_kind = _kind AND m.source_id = _id AND m.status = 'approved'
   ORDER BY m.created_at DESC LIMIT 1;

  IF v_method IS NULL THEN RETURN; END IF;

  IF _kind = 'store_order' THEN
    UPDATE public.store_orders
       SET payment_method = v_method::public.payment_method
     WHERE id = _id AND payment_method::text IS DISTINCT FROM v_method;

  ELSIF _kind = 'partner_product_order' THEN
    v_alvo := CASE WHEN v_method = 'credit_card' THEN 'card' ELSE v_method END;

    UPDATE public.partner_product_orders
       SET payment_method = v_alvo
     WHERE id = _id AND payment_method IS DISTINCT FROM v_alvo;

    IF FOUND THEN
      PERFORM public.admin_reprocess_partner_order(_id);
    END IF;
  END IF;
END;
$fn$;
