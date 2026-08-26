-- ============================================================================
-- PASSO 2a — a mensalidade passa a ler a taxa vigente
--
-- Unica mudanca de comportamento: o imposto sai do literal 0.06 e passa a vir
-- de taxa_vigente(). Como a linha vigente traz imposto_pct = 6, o resultado e
-- identico ao centavo. Nada mais no corpo foi tocado.
--
-- O COALESCE com 6 e rede de seguranca, nao fonte: se a tabela de vigencia
-- ficar sem linha valida, a mensalidade continua fechando em vez de quebrar.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.process_subscription_invoice_payment(_invoice_id uuid, _method invoice_payment_method, _wallet_source text DEFAULT NULL::text, _performed_by uuid DEFAULT NULL::uuid, _fee_amount numeric DEFAULT 0, _mp_payment_id text DEFAULT NULL::text)
 RETURNS subscription_invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv public.subscription_invoices;
  v_tax numeric;
  v_net numeric;
  v_remaining numeric;
  v_user uuid;
  v_profile_id uuid;
  v_breakdown jsonb := '{}'::jsonb;
  v_taxa public.taxas_vigentes;
BEGIN
  SELECT * INTO inv FROM public.subscription_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.status = 'paid' THEN RETURN inv; END IF;

  v_user := inv.user_id;
  v_remaining := inv.amount - COALESCE(_fee_amount, 0);
  v_taxa := public.taxa_vigente(CURRENT_DATE);
  v_tax := round((v_remaining * COALESCE(v_taxa.imposto_pct, 6) / 100)::numeric, 2);
  v_net := round((v_remaining - v_tax)::numeric, 2);

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_user;

  IF _method = 'wallet' THEN
    IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
    v_breakdown := public.debit_user_wallets_cascade(v_profile_id, inv.amount, 'Mensalidade paga com carteira');
  END IF;

  INSERT INTO public.admin_system_wallet(id, available_balance, total_earned)
  VALUES (true, v_net, v_net)
  ON CONFLICT (id) DO UPDATE
    SET available_balance = admin_system_wallet.available_balance + EXCLUDED.available_balance,
        total_earned = admin_system_wallet.total_earned + EXCLUDED.total_earned,
        updated_at = now();

  INSERT INTO public.admin_system_wallet_entries(slot_label, amount, kind, notes, subscription_invoice_id)
  VALUES ('Mensalidade Recorrente', v_net, 'subscription',
          'Mensalidade ' || to_char(inv.reference_month, 'MM/YYYY'),
          inv.id);

  IF _fee_amount > 0 THEN
    INSERT INTO public.admin_system_wallet_entries(slot_label, amount, kind, notes, subscription_invoice_id)
    VALUES ('Taxa de Pagamento', -_fee_amount, 'payment_fee',
            'Mensalidade ' || to_char(inv.reference_month, 'MM/YYYY'), inv.id);
  END IF;
  IF v_tax > 0 THEN
    INSERT INTO public.admin_system_wallet_entries(slot_label, amount, kind, notes, subscription_invoice_id)
    VALUES ('Imposto Simples Nacional', -v_tax, 'tax',
            'Mensalidade ' || to_char(inv.reference_month, 'MM/YYYY'), inv.id);
  END IF;

  UPDATE public.subscription_invoices
  SET status = 'paid', paid_at = now(),
      payment_method = _method,
      wallet_source = CASE WHEN _method = 'wallet' THEN COALESCE(NULLIF(_wallet_source, ''), 'mixed') ELSE _wallet_source END,
      wallet_debit_breakdown = CASE WHEN _method = 'wallet' THEN v_breakdown ELSE COALESCE(wallet_debit_breakdown, '{}'::jsonb) END,
      fee_amount = COALESCE(_fee_amount, 0), tax_amount = v_tax, net_to_admin = v_net,
      mp_payment_id = _mp_payment_id, updated_at = now()
  WHERE id = _invoice_id
  RETURNING * INTO inv;

  IF _method = 'wallet' AND v_profile_id IS NOT NULL THEN
    PERFORM public.recalc_wallets_for_owner(v_profile_id);
  END IF;

  INSERT INTO public.subscription_payment_log(invoice_id, user_id, action, performed_by, details)
  VALUES (inv.id, v_user, 'paid', _performed_by,
          jsonb_build_object('method', _method, 'wallet_source', inv.wallet_source,
                             'wallet_debit_breakdown', v_breakdown,
                             'amount', inv.amount, 'net', v_net));
  RETURN inv;
END;
$function$;
