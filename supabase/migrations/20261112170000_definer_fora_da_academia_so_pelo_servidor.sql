-- anon deixa de passar por academia_pode_ver, e as SECURITY DEFINER fora do
-- prefixo academia_ passam pelo mesmo criterio da 20261112150000.
--
-- Continuacao de 12/11/2026. A migration anterior fechou 30 funcoes academia_*
-- e deixou duas pontas: academia_pode_ver devolvia true para anon, e as
-- SECURITY DEFINER de outros prefixos nao tinham sido olhadas.
--
-- 1) academia_pode_ver
--    O "WHEN auth.uid() IS NULL THEN true" foi pensado para o service_role, mas
--    anon tambem nao tem uid. Agora, sem uid, so passa quem nao traz JWT de
--    usuario: o service_role das server functions e o proprio banco (cron,
--    gatilho, MCP), que chegam sem request.jwt.claims. A conta olha o papel do
--    JWT (auth.role()) e o papel da sessao (o SET ROLE do PostgREST), entao
--    anon fica de fora mesmo que um dia chegue sem claims. O ramo de quem tem
--    uid nao mudou. anon e PUBLIC perdem o EXECUTE; as 23 policies que usam a
--    funcao sao TO authenticated.
--    Provado antes de mexer: dos 42 chamadores transitivos dela (funcao que
--    chama funcao, e tabela escrita que dispara gatilho), nenhum tem EXECUTE
--    para anon e nenhum e gatilho; partindo de academia_agente_* e
--    academia_importar_contratos, nenhum caminho chega nela. Nenhuma view,
--    default, check ou cron a usa. O agente da catraca nao passa por aqui.
--
-- 2) SECURITY DEFINER fora de academia_
--    Eram 271 (fora gatilhos) com EXECUTE para anon ou authenticated. Ficam
--    como estao as que dependem de quem chama (auth.uid(), direto ou por
--    helper), as publicas de proposito (catalogo, vitrine, vendedor, codigo de
--    indicacao, certificado) e os helpers usados em policy. O resto:
--
--    a) So o servidor chama: 76 funcoes passam a ter EXECUTE so para
--       service_role. Conferido em src/ e supabase/functions linha a linha
--       (todo .rpc delas e supabaseAdmin, ou o db do robo, que e o
--       supabaseAdmin do webhook api.bot.eventos), no robo-crm-pacote (o
--       conector do PC so fala com /api/bot/eventos), nas outras pastas de
--       C:\dev, no cron (o unico, expire-unpaid-product-orders, roda como
--       postgres), em policies, views, defaults e checks (nenhum). O unico
--       chamador INVOKER e update_coach_withdrawal_status, que chama
--       admin_mark_withdrawal_paid e nao tem chamador no app.
--       As piores, que qualquer um com a chave anonima ou qualquer logado
--       chamava sem checagem nenhuma:
--       - debit_user_wallets_cascade: debitava a carteira de qualquer perfil.
--       - process_partner_product_order_paid: marcava pedido como pago.
--       - extend_*_card_access, extend_user_membership_cards: estendiam a
--         carteirinha.
--       - grant_partner_product_perks, grant_run_challenge_tickets: davam o
--         beneficio da compra sem compra.
--       - admin_mark_withdrawal_paid, admin_mark_student_withdrawal_paid,
--         admin_advance_commission_release, fechar_rede_do_mes: "checavam"
--         is_admin(_admin_user_id), com o id do admin vindo do proprio
--         chamador. fechar_rede_do_mes tinha EXECUTE para anon.
--       - admin_sincronizar_carteiras, recalcular_precos_modo_receive,
--         refresh_coach_medals: "IF auth.uid() IS NOT NULL AND NOT is_admin"
--         com EXECUTE para anon, o mesmo defeito do academia_pode_ver.
--
--    b) O navegador (ou server function com o JWT do usuario) chama:
--       checagem no corpo e sem anon.
--       - process_subscription_invoice_payment: qualquer logado marcava a
--         propria fatura como paga (pix, dinheiro...) e destravava o acesso.
--         Agora admin paga qualquer uma; o dono so a propria e so com a
--         carteira; sem uid, o webhook do Mercado Pago.
--       - postpone_subscription_invoice, revert_subscription_invoice_payment
--         (e reset_subscription_invoice_due_date, que passa pela primeira):
--         anon adiava qualquer fatura ou desfazia pagamento. So admin.
--       - carteirinha_definir_excecao, carteirinha_revogar_excecao: anon dava
--         carteirinha a si mesmo passando o id de um admin. O admin passa a
--         ser quem esta logado; o parametro so vale sem uid (servidor).
--       - ensure_user_subscription: qualquer logado criava assinatura (e
--         fatura, e com ela bloqueio) para outra pessoa. Logado so a propria,
--         salvo admin ou gatilho (pg_trigger_depth() > 0: o gatilho de
--         coach/parceiro cria para o dono do cadastro).
--       - carteirinha_situacao, is_user_blocked_by_subscription: so perdem
--         anon (o navegador chama logado).
--
-- Corpos que mudam: academia_pode_ver e os seis do item 2b. Nos outros, so
-- permissao. CREATE OR REPLACE preserva os grants; DROP + CREATE volta ao
-- default do Supabase (EXECUTE para anon e authenticated) e exige repetir o
-- REVOKE. A trava no fim desfaz tudo se alguma permissao ficar fora do lugar,
-- se academia_pode_ver abrir para anon ou fechar para o servidor, ou se o
-- agente da catraca perder o EXECUTE.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) academia_pode_ver
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.academia_pode_ver(p_partner_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Sem uid entra so quem nao traz JWT de usuario: o service_role das
    -- server functions e o proprio banco (cron, gatilho, MCP), que chega sem
    -- request.jwt.claims. anon tambem nao tem uid e fica de fora.
    WHEN auth.uid() IS NULL THEN
      COALESCE(auth.role(), 'service_role') = 'service_role'
      AND COALESCE(current_setting('role', true), 'none') NOT IN ('anon', 'authenticated')
    ELSE
      public.is_master_admin_atual()
      AND (
        EXISTS (
          SELECT 1 FROM public.partner_members pm
            JOIN public.profiles pr ON pr.id = pm.profile_id
           WHERE pm.partner_id = p_partner_id AND pr.user_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.partners p
            JOIN public.profiles pr ON pr.id = p.profile_id
           WHERE p.id = p_partner_id AND pr.user_id = auth.uid()
        )
      )
  END;
$function$;

REVOKE ALL ON FUNCTION public.academia_pode_ver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_pode_ver(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2a) So o servidor chama: EXECUTE so para service_role
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    -- dinheiro e carteira
    'public.debit_user_wallets_cascade(uuid,numeric,text)',
    'public.process_partner_product_order_paid(uuid)',
    'public.recalc_partner_wallet(uuid)',
    'public.recalc_professional_wallet(uuid)',
    'public.recalc_student_wallet_for_referral(uuid)',
    'public.recalc_product_points(uuid)',
    'public.release_due_partner_product_wallets()',
    'public.revert_transaction_points(uuid)',
    'public.saldo_disponivel(uuid)',
    'public.can_withdraw(uuid)',
    'public.admin_conferencia_pagamentos(uuid)',
    'public.admin_sincronizar_carteiras()',
    'public.recalcular_precos_modo_receive(date,uuid,boolean)',
    -- "admin" vindo do parametro
    'public.admin_mark_withdrawal_paid(uuid,uuid,text)',
    'public.admin_mark_student_withdrawal_paid(uuid,uuid,text)',
    'public.admin_advance_commission_release(uuid,uuid[],uuid,text)',
    'public.fechar_rede_do_mes(integer,integer,uuid,boolean)',
    -- carteirinha, beneficio e assinatura
    'public.extend_coach_card_access(uuid,integer)',
    'public.extend_student_card_access(uuid,integer)',
    'public.extend_user_membership_cards(uuid,integer)',
    'public.student_card_ativa(uuid)',
    'public.grant_partner_product_perks(uuid)',
    'public.grant_run_challenge_tickets(uuid)',
    'public.auto_ensure_subscription_for_profile(uuid)',
    'public.subscription_effective_amount(uuid)',
    'public.has_active_subscription(uuid)',
    -- carreira, ranking e rede
    'public.update_career_challenge_progress(uuid,integer)',
    'public.update_career_period_plans(uuid,integer)',
    'public.upsert_monthly_ranking_on_sale(uuid,integer,numeric,date)',
    'public.refresh_coach_medals()',
    'public.coach_ve_no_periodo(timestamp with time zone,timestamp with time zone)',
    'public.coach_vp_no_periodo(timestamp with time zone,timestamp with time zone)',
    'public.cadeia_coaches_do_perfil(uuid)',
    'public.get_viewer_upline_coach_ids(uuid)',
    'public.commission_seller_profile_id(uuid,uuid)',
    'public.resolve_selling_coach(uuid,uuid)',
    'public.find_hbl_coach_for(uuid)',
    'public.find_master_coach_for(uuid)',
    'public.find_nutritionist_for(uuid)',
    'public.find_upline_with_badge(uuid,coach_badge_key)',
    'public.get_system_fallback_coach_id()',
    'public.has_coach_badge(uuid,coach_badge_key)',
    'public.coach_gets_product_free(uuid,uuid)',
    'public.coach_has_fitmindshape_bypass(uuid)',
    -- venda, agenda e loja
    'public.assign_professionals_for_transaction(uuid)',
    'public.pick_professional_for_sale(uuid,text,uuid)',
    'public.partner_product_used_slots(uuid)',
    'public.has_open_return_request(text,uuid)',
    'public.can_view_digital_product_for(uuid,uuid)',
    'public.expire_unpaid_product_orders()',
    'public.expire_unpaid_professional_appointments()',
    'public.mark_release_event(text,uuid,text,timestamp with time zone,integer)',
    'public.notify_admin_pending_specialty(uuid)',
    -- avaliacao, corrida e competicao
    'public.ensure_coach_evaluation_client_for_student(uuid)',
    'public.sync_coach_evaluation_client_for_student(uuid)',
    'public.increment_share_view(text)',
    'public.run_challenge_progress(uuid,uuid)',
    'public.run_challenge_sync_goals(uuid)',
    'public.enroll_student_in_competition(uuid,text)',
    'public.generate_competition_groups(uuid,integer,integer)',
    'public.generate_competition_reminders()',
    -- robo de WhatsApp (o motor roda com supabaseAdmin)
    'public.bot_bloquear_conexao(uuid,text)',
    'public.bot_confirmar_verificacao(text,text,uuid,uuid,text)',
    'public.bot_contar_envio(uuid)',
    'public.bot_dia_da_conexao(uuid)',
    'public.bot_escolher_conexao(text,uuid,text)',
    'public.bot_registrar_no_cartao(uuid,text,text)',
    'public.bot_vincular_cartao(uuid)',
    'public.partner_feriado_de_hoje(uuid)',
    -- acesso
    'public.acesso_avaliar(uuid,uuid)',
    'public.acesso_avaliar_academia(uuid)',
    -- cadastro e diagnostico
    'public.vincular_toque_ao_perfil(uuid,uuid)',
    'public.find_orphan_registrations()',
    'public.is_test_email(text)',
    'public.count_active_admins()',
    'public.test_mode_cutoff()'
  ]::regprocedure[]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2b) O navegador chama: checagem no corpo e sem anon
-- ---------------------------------------------------------------------------
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

  -- Logado: admin paga qualquer fatura; o dono so a propria, e so com a
  -- carteira. Sem uid: webhook do Mercado Pago (service_role) ou o banco.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_admin(auth.uid())
     AND NOT (_method = 'wallet' AND inv.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

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
  -- So admin adia fatura. Sem uid: servidor ou banco.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

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

CREATE OR REPLACE FUNCTION public.revert_subscription_invoice_payment(_invoice_id uuid, _performed_by uuid)
 RETURNS subscription_invoices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inv public.subscription_invoices;
  v_net numeric := 0;
BEGIN
  -- So admin desfaz pagamento. Sem uid: servidor ou banco.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.carteirinha_definir_excecao(_profile_id uuid, _escopo text, _valido_ate timestamp with time zone, _motivo text, _admin_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid;
  v_anterior timestamptz;
  v_id uuid;
BEGIN
  -- O admin e quem esta logado. O parametro so vale sem uid (servidor): antes
  -- valia sempre, e bastava passar o id de um admin.
  IF NOT public.is_admin(COALESCE(auth.uid(), _admin_user_id)) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF _escopo NOT IN ('aluno','membro') THEN
    RAISE EXCEPTION 'Escopo invalido: use aluno ou membro';
  END IF;
  IF _valido_ate IS NULL THEN
    RAISE EXCEPTION 'Informe ate quando a carteirinha vale';
  END IF;
  IF COALESCE(trim(_motivo),'') = '' THEN
    RAISE EXCEPTION 'Informe o motivo da excecao';
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE user_id = COALESCE(auth.uid(), _admin_user_id);

  IF _escopo = 'aluno' THEN
    SELECT s.card_valid_until INTO v_anterior FROM public.students s WHERE s.profile_id = _profile_id LIMIT 1;
  ELSE
    SELECT c.card_valid_until INTO v_anterior FROM public.coaches c WHERE c.profile_id = _profile_id LIMIT 1;
  END IF;

  UPDATE public.membership_card_overrides
     SET ativo = false, revogado_por = v_admin, revogado_em = now()
   WHERE profile_id = _profile_id AND escopo = _escopo AND ativo;

  INSERT INTO public.membership_card_overrides
    (profile_id, escopo, valido_ate, motivo, valor_anterior, criado_por)
  VALUES (_profile_id, _escopo, _valido_ate, _motivo, v_anterior, v_admin)
  RETURNING id INTO v_id;

  IF _escopo = 'aluno' THEN
    UPDATE public.students SET card_valid_until = _valido_ate WHERE profile_id = _profile_id;
  ELSE
    UPDATE public.coaches  SET card_valid_until = _valido_ate WHERE profile_id = _profile_id;
    UPDATE public.partners SET card_valid_until = _valido_ate, updated_at = now() WHERE profile_id = _profile_id;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'valor_anterior', v_anterior, 'valido_ate', _valido_ate);
END;
$function$;

CREATE OR REPLACE FUNCTION public.carteirinha_revogar_excecao(_override_id uuid, _admin_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin uuid;
  o record;
  v_novo timestamptz;
BEGIN
  -- O admin e quem esta logado. O parametro so vale sem uid (servidor).
  IF NOT public.is_admin(COALESCE(auth.uid(), _admin_user_id)) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o FROM public.membership_card_overrides WHERE id = _override_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Excecao nao encontrada'; END IF;
  IF NOT o.ativo THEN RAISE EXCEPTION 'Esta excecao ja esta inativa'; END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE user_id = COALESCE(auth.uid(), _admin_user_id);

  UPDATE public.membership_card_overrides
     SET ativo = false, revogado_por = v_admin, revogado_em = now()
   WHERE id = _override_id;

  -- Volta para a data CALCULADA, nao para o valor que estava antes da edicao.
  IF o.escopo = 'aluno' THEN
    PERFORM public.recalculate_student_card_access(
      (SELECT s.id FROM public.students s WHERE s.profile_id = o.profile_id LIMIT 1));
    SELECT s.card_valid_until INTO v_novo FROM public.students s WHERE s.profile_id = o.profile_id LIMIT 1;
  ELSE
    SELECT max(COALESCE(si.paid_at, si.created_at) + INTERVAL '30 days') INTO v_novo
      FROM public.subscription_invoices si
      JOIN public.profiles pr ON pr.user_id = si.user_id
     WHERE pr.id = o.profile_id AND si.status::text IN ('paid','exempted') AND si.paid_at IS NOT NULL;
    UPDATE public.coaches  SET card_valid_until = v_novo WHERE profile_id = o.profile_id;
    UPDATE public.partners SET card_valid_until = v_novo, updated_at = now() WHERE profile_id = o.profile_id;
  END IF;

  RETURN jsonb_build_object('revogada', _override_id, 'voltou_para', v_novo);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_user_subscription(_user_id uuid, _billing_day integer DEFAULT 5)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_plan_id uuid;
  v_sub_id uuid;
  v_ref date := date_trunc('month', CURRENT_DATE)::date;
  v_due date;
  v_amount numeric;
  v_billing_day int;
BEGIN
  -- Logado so garante a propria assinatura, salvo admin. Pelo gatilho de
  -- coach/parceiro (auto_ensure_subscription_for_profile) a assinatura e do
  -- dono do cadastro e quem esta logado e quem disparou: pg_trigger_depth() > 0.
  IF auth.uid() IS NOT NULL AND pg_trigger_depth() = 0
     AND _user_id IS DISTINCT FROM auth.uid()
     AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_sub_id FROM public.user_subscriptions WHERE user_id = _user_id;
  IF v_sub_id IS NULL THEN
    SELECT id INTO v_plan_id FROM public.subscription_plans WHERE active = true ORDER BY created_at LIMIT 1;
    IF v_plan_id IS NULL THEN
      RAISE EXCEPTION 'No active subscription plan';
    END IF;

    INSERT INTO public.user_subscriptions(user_id, plan_id, billing_day)
    VALUES (_user_id, v_plan_id, GREATEST(1, LEAST(28, _billing_day)))
    RETURNING id INTO v_sub_id;
  END IF;

  -- Garante a fatura do mês corrente para essa assinatura (idempotente)
  SELECT billing_day INTO v_billing_day FROM public.user_subscriptions WHERE id = v_sub_id;
  v_due := (v_ref + ((COALESCE(v_billing_day,5) - 1) || ' days')::interval)::date;
  v_amount := public.subscription_effective_amount(v_sub_id);

  INSERT INTO public.subscription_invoices(user_subscription_id, user_id, reference_month, due_date, amount, status)
  VALUES (v_sub_id, _user_id, v_ref, v_due, v_amount, 'pending')
  ON CONFLICT (user_subscription_id, reference_month) DO NOTHING;

  RETURN v_sub_id;
END;
$function$;

DO $$
DECLARE
  v_fn regprocedure;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.process_subscription_invoice_payment(uuid,invoice_payment_method,text,uuid,numeric,text)',
    'public.postpone_subscription_invoice(uuid,date,uuid)',
    'public.reset_subscription_invoice_due_date(uuid,uuid)',
    'public.revert_subscription_invoice_payment(uuid,uuid)',
    'public.carteirinha_definir_excecao(uuid,text,timestamp with time zone,text,uuid)',
    'public.carteirinha_revogar_excecao(uuid,uuid)',
    'public.carteirinha_situacao(uuid)',
    'public.ensure_user_subscription(uuid,integer)',
    'public.is_user_blocked_by_subscription(uuid)'
  ]::regprocedure[]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Trava: permissao fora do lugar, academia_pode_ver errada ou agente sem
--    EXECUTE desfazem a migration inteira
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_erros text;
  v_achadas int;
BEGIN
  SELECT count(*), string_agg(p.oid::regprocedure::text, ', ') FILTER (
           WHERE has_function_privilege('anon', p.oid, 'EXECUTE')
              OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
              OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE'))
    INTO v_achadas, v_erros
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN (
       'debit_user_wallets_cascade', 'process_partner_product_order_paid', 'recalc_partner_wallet',
       'recalc_professional_wallet', 'recalc_student_wallet_for_referral', 'recalc_product_points',
       'release_due_partner_product_wallets', 'revert_transaction_points', 'saldo_disponivel', 'can_withdraw',
       'admin_conferencia_pagamentos', 'admin_sincronizar_carteiras', 'recalcular_precos_modo_receive',
       'admin_mark_withdrawal_paid', 'admin_mark_student_withdrawal_paid', 'admin_advance_commission_release',
       'fechar_rede_do_mes', 'extend_coach_card_access', 'extend_student_card_access',
       'extend_user_membership_cards', 'student_card_ativa', 'grant_partner_product_perks',
       'grant_run_challenge_tickets', 'auto_ensure_subscription_for_profile', 'subscription_effective_amount',
       'has_active_subscription', 'update_career_challenge_progress', 'update_career_period_plans',
       'upsert_monthly_ranking_on_sale', 'refresh_coach_medals', 'coach_ve_no_periodo', 'coach_vp_no_periodo',
       'cadeia_coaches_do_perfil', 'get_viewer_upline_coach_ids', 'commission_seller_profile_id',
       'resolve_selling_coach', 'find_hbl_coach_for', 'find_master_coach_for', 'find_nutritionist_for',
       'find_upline_with_badge', 'get_system_fallback_coach_id', 'has_coach_badge', 'coach_gets_product_free',
       'coach_has_fitmindshape_bypass', 'assign_professionals_for_transaction', 'pick_professional_for_sale',
       'partner_product_used_slots', 'has_open_return_request', 'can_view_digital_product_for',
       'expire_unpaid_product_orders', 'expire_unpaid_professional_appointments', 'mark_release_event',
       'notify_admin_pending_specialty', 'ensure_coach_evaluation_client_for_student',
       'sync_coach_evaluation_client_for_student', 'increment_share_view', 'run_challenge_progress',
       'run_challenge_sync_goals', 'enroll_student_in_competition', 'generate_competition_groups',
       'generate_competition_reminders', 'bot_bloquear_conexao', 'bot_confirmar_verificacao', 'bot_contar_envio',
       'bot_dia_da_conexao', 'bot_escolher_conexao', 'bot_registrar_no_cartao', 'bot_vincular_cartao',
       'partner_feriado_de_hoje', 'acesso_avaliar', 'acesso_avaliar_academia', 'vincular_toque_ao_perfil',
       'find_orphan_registrations', 'is_test_email', 'count_active_admins', 'test_mode_cutoff');
  IF v_achadas <> 76 OR v_erros IS NOT NULL THEN
    RAISE EXCEPTION 'Deveria ser so service_role (achadas %/76): %', v_achadas, v_erros;
  END IF;

  SELECT count(*), string_agg(p.oid::regprocedure::text, ', ') FILTER (
           WHERE has_function_privilege('anon', p.oid, 'EXECUTE')
              OR NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
              OR NOT has_function_privilege('service_role', p.oid, 'EXECUTE'))
    INTO v_achadas, v_erros
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN (
       'academia_pode_ver', 'process_subscription_invoice_payment', 'postpone_subscription_invoice',
       'reset_subscription_invoice_due_date', 'revert_subscription_invoice_payment',
       'carteirinha_definir_excecao', 'carteirinha_revogar_excecao', 'carteirinha_situacao',
       'ensure_user_subscription', 'is_user_blocked_by_subscription');
  IF v_achadas <> 10 OR v_erros IS NOT NULL THEN
    RAISE EXCEPTION 'Deveria ser authenticated e service_role, sem anon (achadas %/10): %', v_achadas, v_erros;
  END IF;

  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO v_erros
    FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND (p.proname LIKE 'academia\_agente\_%' OR p.proname = 'academia_importar_contratos')
     AND p.proname <> 'academia_agente_gerar_codigo'
     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');
  IF v_erros IS NOT NULL THEN
    RAISE EXCEPTION 'O agente da catraca perderia o EXECUTE em: %', v_erros;
  END IF;

  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  IF public.academia_pode_ver(gen_random_uuid()) THEN
    RAISE EXCEPTION 'academia_pode_ver ainda devolve true para anon';
  END IF;
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  IF NOT public.academia_pode_ver(gen_random_uuid()) THEN
    RAISE EXCEPTION 'academia_pode_ver fechou para o service_role';
  END IF;
  PERFORM set_config('request.jwt.claims', '', true);
  IF NOT public.academia_pode_ver(gen_random_uuid()) THEN
    RAISE EXCEPTION 'academia_pode_ver fechou para o banco (cron, gatilho)';
  END IF;
END $$;

COMMIT;
