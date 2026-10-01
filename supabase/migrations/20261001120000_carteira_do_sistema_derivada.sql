-- O saldo da carteira do sistema passa a ser calculado a partir do extrato.
--
-- `admin_system_wallet` era somado e subtraído à mão em sete funções e dois
-- pontos do app, e o extrato (`admin_system_wallet_entries`) era gravado à
-- parte. Em 01/10/2026 o saldo estava R$ 239,12 acima do que o extrato
-- sustenta, por quatro portas:
--
-- 1) Atribuir a uma nutricionista ou a um professor a parte de uma venda que
--    estava sem ninguém lança o débito no extrato e não tira do saldo
--    (R$ 94,00 do Helton, 02/09).
-- 2) Apagar uma venda (recriar conta de teste, excluir usuário) apaga em cascata
--    o lançamento dela e deixa o dinheiro no saldo (≈ R$ 145).
-- 3) O estorno de pedido de parceiro debitava também a taxa do Mercado Pago e
--    o imposto, que entram no extrato só como linha informativa e nunca
--    entraram no saldo (R$ 1,60 a menos, nos 6 ingressos da Rave).
-- 4) O app (estorno e venda de teste) lia o saldo e gravava de volta em outra
--    requisição — corrida, e sem ligação com o extrato.
--
-- Mesmo princípio das carteiras das pessoas: o extrato é a fonte, o saldo é
-- derivado. As funções que já mexem no saldo continuam como estão; no fim de
-- cada transação que toca o extrato, o saldo é reescrito a partir dele.
--
-- A regra do que conta:
--   receita  = taxa do sistema de venda que ainda existe ('credit' com origem
--              existente, sem as linhas informativas 'Taxa de Pagamento - …'
--              e 'Imposto - …'), mensalidade de fatura que existe
--              ('subscription') e rede não liberada no fechamento
--   débitos  = todo 'debit' (estorno, atribuição, retirada)
--   retirada = débito sem origem (saque do sistema, `register_admin_wallet_debit`)
--   saldo    = receita − débitos
--   ganho    = saldo + retiradas
-- Lançamento de venda que não existe mais fica de fora e aparece no resumo.
CREATE OR REPLACE FUNCTION public.conciliar_carteira_do_sistema(_corrigir boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_receita numeric;
  v_debitos numeric;
  v_retiradas numeric;
  v_ignorado numeric;
  v_esperado numeric;
  v_saldo numeric;
  v_ganho numeric;
  v_retirado numeric;
  v_diferenca numeric;
BEGIN
  IF pg_trigger_depth() = 0 AND auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Trava antes de somar: de duas gravações simultâneas, a segunda espera a
  -- primeira terminar e soma já vendo os lançamentos dela.
  IF _corrigir THEN
    PERFORM 1 FROM admin_system_wallet WHERE id = true FOR UPDATE;
  END IF;

  SELECT COALESCE(sum(e.amount) FILTER (WHERE g.grupo = 'receita'), 0),
         COALESCE(sum(e.amount) FILTER (WHERE g.grupo = 'debito'), 0),
         COALESCE(sum(e.amount) FILTER (WHERE g.grupo = 'debito' AND e.transaction_id IS NULL
                                          AND e.partner_order_id IS NULL AND e.subscription_invoice_id IS NULL), 0),
         COALESCE(sum(e.amount) FILTER (WHERE g.grupo = 'sem_origem'), 0)
    INTO v_receita, v_debitos, v_retiradas, v_ignorado
    FROM admin_system_wallet_entries e
   CROSS JOIN LATERAL (SELECT CASE
       WHEN e.kind = 'debit' THEN 'debito'
       WHEN e.kind IN ('payment_fee', 'tax') THEN 'informativo'
       WHEN e.kind = 'credit' AND (e.slot_label LIKE 'Taxa de Pagamento - %' OR e.slot_label LIKE 'Imposto - %') THEN 'informativo'
       WHEN e.kind = 'subscription'
            AND EXISTS (SELECT 1 FROM subscription_invoices i WHERE i.id = e.subscription_invoice_id) THEN 'receita'
       WHEN e.kind = 'credit' AND e.transaction_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM transactions t WHERE t.id = e.transaction_id) THEN 'receita'
       WHEN e.kind = 'credit' AND e.partner_order_id IS NOT NULL
            AND EXISTS (SELECT 1 FROM partner_product_orders o WHERE o.id = e.partner_order_id) THEN 'receita'
       WHEN e.kind = 'credit' AND e.transaction_id IS NULL AND e.partner_order_id IS NULL
            AND e.slot_label LIKE 'Rede nao liberada%' THEN 'receita'
       ELSE 'sem_origem' END AS grupo) g;

  v_esperado := round(v_receita - v_debitos, 2);
  SELECT available_balance, total_earned, total_withdrawn
    INTO v_saldo, v_ganho, v_retirado
    FROM admin_system_wallet WHERE id = true;
  v_diferenca := round(COALESCE(v_saldo, 0) - v_esperado, 2);

  IF _corrigir AND (v_saldo IS DISTINCT FROM v_esperado
                    OR v_ganho IS DISTINCT FROM round(v_esperado + v_retiradas, 2)
                    OR v_retirado IS DISTINCT FROM round(v_retiradas, 2)) THEN
    UPDATE admin_system_wallet
       SET available_balance = v_esperado,
           total_earned = round(v_esperado + v_retiradas, 2),
           total_withdrawn = round(v_retiradas, 2),
           updated_at = now()
     WHERE id = true;

    -- Correção pedida à mão fica no histórico; a automática, a cada venda, não.
    IF pg_trigger_depth() = 0 AND v_diferenca <> 0 THEN
      INSERT INTO admin_audit_log (actor_profile_id, target_profile_id, action, notes)
      VALUES ((SELECT id FROM profiles WHERE user_id = auth.uid()), NULL, 'conciliar_carteira_do_sistema',
              format('Saldo do sistema de %s para %s (diferença %s). Receita %s, débitos %s, retiradas %s, lançamentos sem venda ignorados %s.',
                     v_saldo, v_esperado, v_diferenca, v_receita, v_debitos, v_retiradas, v_ignorado));
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'receita', v_receita,
    'debitos', v_debitos,
    'retiradas', v_retiradas,
    'sem_origem_ignorado', v_ignorado,
    'esperado', v_esperado,
    'saldo_gravado', v_saldo,
    'diferenca', v_diferenca,
    'corrigido', _corrigir AND v_diferenca <> 0
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.conciliar_carteira_do_sistema(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_carteira_do_sistema(boolean) TO service_role;

-- No fim de toda transação que mexe no extrato — inclusive apagar uma venda,
-- que leva o lançamento em cascata — o saldo é reescrito a partir dele.
-- Adiado para o fim da transação: as funções que ainda somam no saldo à mão
-- fazem isso antes, e a reescrita vem por último.
CREATE OR REPLACE FUNCTION public.trg_carteira_do_sistema_derivada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Uma vez por transação: o gatilho é por linha, mas roda no fim, quando todas
  -- as linhas já mudaram — a primeira reescrita já vê tudo. Sem isto, excluir
  -- um usuário com 100 lançamentos refaria a soma 100 vezes.
  IF current_setting('fitmind.carteira_sistema_conciliada', true) = txid_current()::text THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('fitmind.carteira_sistema_conciliada', txid_current()::text, true);
  PERFORM public.conciliar_carteira_do_sistema(true);
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_carteira_do_sistema_derivada ON public.admin_system_wallet_entries;
CREATE CONSTRAINT TRIGGER trg_carteira_do_sistema_derivada
  AFTER INSERT OR UPDATE OR DELETE ON public.admin_system_wallet_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_carteira_do_sistema_derivada();
