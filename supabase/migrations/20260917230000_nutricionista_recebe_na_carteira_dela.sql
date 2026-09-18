-- ============================================================================
-- A carteira de nutricionista nunca tinha sido usada, e o primeiro pagamento
-- ia sair errado de dois jeitos.
--
-- Ate 17/09/2026: zero lancamentos em nutritionist_blocked_entries, zero
-- atribuicoes, zero pagamentos. As 56 fatias de nutricionista (R$ 1.822,70)
-- estavam na carteira do sistema, sem dono, porque `find_nutritionist_for`
-- nao escolhe ninguem. O Helton e o primeiro nutricionista a receber.
--
-- 1. `pay_nutritionist_available` gravava o pagamento tambem em
--    withdrawal_requests, "para o historico unificado". So que `carteira_atual`
--    soma TODO saque pago da pessoa como sacado, e `financial_ledger_events`
--    nao conhece ganho de nutricionista. O pagamento de nutricionista era
--    cobrado da carteira de coach/profissional da mesma pessoa, virava "pago a
--    mais" e era abatido dos ganhos seguintes dela, sem ninguem ver. Os 8
--    nutricionistas cadastrados sao todos coaches. O Helton tinha R$ 83,20 a
--    liberar como profissional: seriam engolidos pelo primeiro pagamento. O
--    pagamento agora fica so na carteira de nutricionista, onde o ganho mora.
--
-- 2. `recalc_nutritionist_wallets` nao contava lancamento 'paid' no ganho nem
--    no liberado. Depois de qualquer pagamento, um recalculo (a limpeza de
--    vendas de teste chama) mostrava "ganhou 0, sacou X". Passa a tratar os
--    lancamentos como a verdade, inclusive o sacado, e fica so com
--    service_role — estava aberta ate para anon.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auditoria.funcoes_nutricionista_20260917 AS
  SELECT p.proname, pg_get_functiondef(p.oid) AS definicao, md5(p.prosrc) AS md5, now() AS tirado_em
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('pay_nutritionist_available', 'recalc_nutritionist_wallets');

CREATE OR REPLACE FUNCTION public.pay_nutritionist_available(_profile_id uuid, _notes text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_amount NUMERIC := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COALESCE(SUM(amount),0) INTO v_amount
  FROM public.nutritionist_blocked_entries
  WHERE profile_id = _profile_id AND status = 'released';

  IF v_amount <= 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.nutritionist_blocked_entries
  SET status = 'paid', released_at = COALESCE(released_at, NOW()), updated_at = NOW(),
      notes = COALESCE(notes,'') || CASE WHEN _notes IS NOT NULL THEN E'\n[admin pay] '||_notes ELSE '' END
  WHERE profile_id = _profile_id AND status = 'released';

  UPDATE public.nutritionist_wallets
  SET available_balance = 0,
      total_withdrawn = COALESCE(total_withdrawn,0) + v_amount,
      updated_at = NOW()
  WHERE profile_id = _profile_id;

  -- O pagamento fica so aqui. Ate 17/09/2026 ele tambem virava um
  -- withdrawal_request pago, e `carteira_atual` soma todo saque pago da pessoa
  -- sem olhar a origem -- mas o ledger nao conhece ganho de nutricionista. O
  -- pagamento era cobrado da carteira de coach da mesma pessoa.

  RETURN v_amount;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalc_nutritionist_wallets()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Os lancamentos sao a verdade e a carteira e cache. 'paid' conta como
  -- ganho e como liberado: antes nao contava, e depois de pagar o recalculo
  -- mostrava "ganhou 0, sacou X".
  UPDATE nutritionist_wallets w
  SET blocked_balance = COALESCE((
        SELECT SUM(amount) FROM nutritionist_blocked_entries
        WHERE profile_id = w.profile_id AND status = 'blocked'
      ), 0),
      total_earned = COALESCE((
        SELECT SUM(amount) FROM nutritionist_blocked_entries
        WHERE profile_id = w.profile_id AND status IN ('blocked','released','paid')
      ), 0),
      total_released = COALESCE((
        SELECT SUM(amount) FROM nutritionist_blocked_entries
        WHERE profile_id = w.profile_id AND status IN ('released','paid')
      ), 0),
      total_withdrawn = COALESCE((
        SELECT SUM(amount) FROM nutritionist_blocked_entries
        WHERE profile_id = w.profile_id AND status = 'paid'
      ), 0),
      available_balance = COALESCE((
        SELECT SUM(amount) FROM nutritionist_blocked_entries
        WHERE profile_id = w.profile_id AND status = 'released'
      ), 0),
      updated_at = now();
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.recalc_nutritionist_wallets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_nutritionist_wallets() TO service_role;

-- ============================================================================
-- O Helton e o nutricionista da venda FM-D77E7F0E, e ja recebeu.
--
-- Protocolo "Perda de Peso Intermediario" vendido pela coach Karla Oliveira da
-- Silva para a aluna dela Ariane Nataly em 02/09/2026 (R$ 1.280,00, cartao em
-- 4x). A fatia de nutricionista, R$ 94,00, caiu na carteira do sistema como
-- "nutricionista ausente". O Erick pagou o Helton por Pix, fora do sistema,
-- em 17/09/2026.
--
-- Mesma sequencia de `assignNutritionistToSystemEntry` -- lancamento na
-- carteira dele e debito no sistema para zerar a parte nao atribuida --, ja
-- nascendo paga e sem withdrawal_request, pelo motivo do item 1.
-- ============================================================================

INSERT INTO public.nutritionist_blocked_entries
  (transaction_id, profile_id, student_id, product_id, slot_label, amount, status, reason, released_at, notes)
SELECT t.id, 'ebee14ec-8555-4217-af01-c6cd0e90af3b', t.student_id, t.product_id,
       'Nutricionista', 94.00, 'paid', 'Atribuição manual de venda', now(),
       'Venda FM-D77E7F0E, coach Karla Oliveira da Silva. Pago por Pix fora do sistema pelo Erick em 17/09/2026.'
  FROM public.transactions t
 WHERE t.id = 'a114a08c-c506-429f-98ac-8d5879747579'
   AND NOT EXISTS (SELECT 1 FROM public.nutritionist_blocked_entries e WHERE e.transaction_id = t.id);

INSERT INTO public.admin_system_wallet_entries (transaction_id, slot_label, amount, kind, notes)
SELECT 'a114a08c-c506-429f-98ac-8d5879747579', 'Nutricionista (nutricionista ausente)', 94.00, 'debit',
       'Atribuído à nutricionista (profile_id=ebee14ec-8555-4217-af01-c6cd0e90af3b) — Helton Matos Fernandes. Pago por Pix fora do sistema em 17/09/2026.'
 WHERE NOT EXISTS (SELECT 1 FROM public.admin_system_wallet_entries
                    WHERE transaction_id = 'a114a08c-c506-429f-98ac-8d5879747579' AND kind = 'debit');

INSERT INTO public.nutritionist_wallets (profile_id)
VALUES ('ebee14ec-8555-4217-af01-c6cd0e90af3b')
ON CONFLICT (profile_id) DO NOTHING;

SELECT public.recalc_nutritionist_wallets();
