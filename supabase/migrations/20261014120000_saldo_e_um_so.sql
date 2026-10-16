-- O saldo da pessoa passa a ser um número só, em todas as telas.
--
-- 14/10/2026: a Marilene Araújo entrou bloqueada pela mensalidade. A tela dizia
-- "Descontar da carteira (R$ 920,60)", o pagamento recusava por saldo
-- insuficiente, e o painel admin mostrava R$ 26,15 liberado. Os R$ 920,60 eram
-- tudo o que ela já ganhou como coach (`ganho_coach`), não o saldo — a tela
-- pegava a "carteira de origem" e mostrava o ganho dela. O saldo certo é
-- `carteira_atual.disponivel`: R$ 26,15.
--
-- O resto do conserto está no código (as telas leem `carteira_atual`). Aqui:
--
-- 1. `carteira_atual` respondia a qualquer um, inclusive sem login: com a chave
--    pública do app e `_profile_id = null` saía o nome, o ganho, o saque e o
--    saldo de todo mundo. `REVOKE ... FROM PUBLIC` não tirava o `anon`, que
--    recebe EXECUTE explícito por privilégio padrão. Agora: sem sessão só o
--    servidor; com sessão, a própria carteira, ou todas se for admin.
--
-- 2. `auditar_carteiras` deixava passar quem não tem sessão — `anon` incluído —
--    e mostrava nome e valores de todos. Fica só para o servidor.
--
-- 3. O saque conferia a soma das tabelas de carteira, incluindo
--    `student_wallets`, que só guarda FitCoin. Passa a conferir o mesmo
--    `disponivel` que a pessoa e o admin veem.
--
-- 4. As tabelas de carteira envelhecem quando um valor vence a carência: nada
--    dispara nesse instante, e o cron das 03:00 só recalcula quem teve
--    *comissão* liberada. Venda de produto vencida (o Jean Reis mostrava
--    R$ 0,06 disponível com R$ 1.030,90 de saldo) e comissão que vence durante
--    o dia ficavam velhas. De hora em hora, `auditar_carteiras(true)` recalcula
--    quem divergir do extrato.

CREATE OR REPLACE FUNCTION public.carteira_atual(_profile_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(profile_id uuid, nome text, ganho numeric, liberado numeric, pendente numeric,
              bloqueado_por_meta numeric, sacado numeric, saque_em_aberto numeric,
              gasto_na_plataforma numeric, adiantamento_aberto numeric, disponivel numeric,
              pago_a_mais numeric, a_receber_depois numeric,
              ganho_coach numeric, ganho_parceiro numeric, ganho_profissional numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  -- Quem pergunta: sem sessão é o servidor (chave de serviço, cron). Com
  -- sessão, só o admin vê os outros; os demais veem a própria carteira.
  WITH quem AS (
    SELECT auth.uid() AS uid,
           auth.uid() IS NULL OR public.is_admin(auth.uid()) AS ve_todos
  ),
  alvo AS (
    SELECT p.id, p.name::text AS nome, p.user_id
      FROM public.profiles p
      CROSS JOIN quem
     WHERE (_profile_id IS NULL OR p.id = _profile_id)
       AND (quem.ve_todos OR p.user_id = quem.uid)
  ),
  evento AS (
    SELECT e.beneficiary_profile_id AS pid, e.source_kind, e.state, e.amount
      FROM public.financial_ledger_events(_profile_id) e
     WHERE e.source_kind <> 'fitcoin'
  ),
  ledger AS (
    SELECT pid,
           SUM(amount)                                             AS ganho,
           SUM(amount) FILTER (WHERE state = 'available')          AS liberado,
           SUM(amount) FILTER (WHERE state = 'hold')               AS pendente,
           SUM(amount) FILTER (WHERE state = 'network_blocked')    AS bloqueado,
           SUM(amount) FILTER (WHERE source_kind = 'coach')        AS de_coach,
           SUM(amount) FILTER (WHERE source_kind = 'partner')      AS de_parceiro,
           SUM(amount) FILTER (WHERE source_kind = 'professional') AS de_profissional
      FROM evento GROUP BY pid
  ),
  saque AS (
    SELECT w.profile_id AS pid,
           SUM(w.amount) FILTER (WHERE w.status = 'paid')                                 AS pago,
           SUM(w.amount) FILTER (WHERE w.status IN ('requested','approved','processing')) AS aberto
      FROM public.withdrawal_requests w
      JOIN alvo a ON a.id = w.profile_id
     GROUP BY w.profile_id
  ),
  saque_aluno AS (
    SELECT s.profile_id AS pid,
           SUM(sw.amount) FILTER (WHERE sw.status::text = 'paid')                                 AS pago,
           SUM(sw.amount) FILTER (WHERE sw.status::text IN ('requested','approved','processing')) AS aberto
      FROM public.student_withdrawal_requests sw
      JOIN public.students s ON s.id = sw.student_id
      JOIN alvo a ON a.id = s.profile_id
     GROUP BY s.profile_id
  ),
  gasto_mensalidade AS (
    SELECT a.id AS pid, SUM(i.amount) AS valor
      FROM public.subscription_invoices i
      JOIN alvo a ON a.user_id = i.user_id
     WHERE i.status = 'paid' AND i.payment_method = 'wallet'
     GROUP BY a.id
  ),
  gasto_loja AS (
    SELECT s.profile_id AS pid, SUM(o.total_amount) AS valor
      FROM public.store_orders o
      JOIN public.students s ON s.id = o.student_id
      JOIN alvo a ON a.id = s.profile_id
     WHERE o.status = 'paid' AND o.payment_method::text = 'wallet'
     GROUP BY s.profile_id
  ),
  gasto_parceiro AS (
    SELECT s.profile_id AS pid, SUM(o.gross_amount) AS valor
      FROM public.partner_product_orders o
      JOIN public.students s ON s.id = o.student_id
      JOIN alvo a ON a.id = s.profile_id
     WHERE o.status = 'paid' AND o.payment_method = 'wallet'
     GROUP BY s.profile_id
  ),
  adiantamento AS (
    SELECT av.profile_id AS pid, SUM(GREATEST(av.amount - av.settled_amount, 0)) AS aberto
      FROM public.wallet_advances av
      JOIN alvo a ON a.id = av.profile_id
     GROUP BY av.profile_id
  ),
  junto AS (
    SELECT a.id, a.nome,
           COALESCE(l.ganho, 0) AS ganho, COALESCE(l.liberado, 0) AS liberado,
           COALESCE(l.pendente, 0) AS pendente, COALESCE(l.bloqueado, 0) AS bloqueado,
           COALESCE(sq.pago, 0)   + COALESCE(sa.pago, 0)   AS sacado,
           COALESCE(sq.aberto, 0) + COALESCE(sa.aberto, 0) AS saque_aberto,
           COALESCE(gm.valor, 0) + COALESCE(gl.valor, 0) + COALESCE(gp.valor, 0) AS gasto,
           COALESCE(ad.aberto, 0) AS adiantamento,
           COALESCE(l.de_coach, 0) AS de_coach, COALESCE(l.de_parceiro, 0) AS de_parceiro,
           COALESCE(l.de_profissional, 0) AS de_profissional
      FROM alvo a
      LEFT JOIN ledger l ON l.pid = a.id
      LEFT JOIN saque sq ON sq.pid = a.id
      LEFT JOIN saque_aluno sa ON sa.pid = a.id
      LEFT JOIN gasto_mensalidade gm ON gm.pid = a.id
      LEFT JOIN gasto_loja gl ON gl.pid = a.id
      LEFT JOIN gasto_parceiro gp ON gp.pid = a.id
      LEFT JOIN adiantamento ad ON ad.pid = a.id
     WHERE l.pid IS NOT NULL OR sq.pid IS NOT NULL OR sa.pid IS NOT NULL
  ),
  conta AS (
    SELECT j.*, (liberado - sacado - saque_aberto - gasto - adiantamento) AS saldo
      FROM junto j
  )
  SELECT id, nome,
         ROUND(ganho,2), ROUND(liberado,2), ROUND(pendente,2), ROUND(bloqueado,2),
         ROUND(sacado,2), ROUND(saque_aberto,2), ROUND(gasto,2), ROUND(adiantamento,2),
         ROUND(GREATEST(saldo, 0), 2)                              AS disponivel,
         -- Quanto saiu além do que estava liberado. Não é erro de conta: é
         -- dinheiro já pago que o pendente vai cobrir quando vencer.
         ROUND(GREATEST(-saldo, 0), 2)                             AS pago_a_mais,
         -- O que sobra para a pessoa depois que tudo liberar e o pago a mais
         -- for descontado. É este o número para planejar o próximo pagamento.
         ROUND(pendente + bloqueado + saldo, 2)                    AS a_receber_depois,
         ROUND(de_coach,2), ROUND(de_parceiro,2), ROUND(de_profissional,2)
    FROM conta;
$function$;

REVOKE ALL ON FUNCTION public.carteira_atual(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.carteira_atual(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_seller_withdrawal_atomic(
  _source text,
  _entity_id uuid,
  _amount numeric,
  _pix_key text,
  _pix_key_type text DEFAULT 'other'::text,
  _notes text DEFAULT NULL::text
)
RETURNS public.withdrawal_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_profile_id uuid;
  v_partner_id uuid := NULL;
  v_professional_coach_id uuid := NULL;
  v_available numeric := 0;
  v_result public.withdrawal_requests%ROWTYPE;
  v_can record;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão inválida';
  END IF;

  SELECT p.id INTO v_profile_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid()
    AND p.merged_into_profile_id IS NULL;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  IF _amount IS NULL OR round(_amount, 2) < 50 THEN
    RAISE EXCEPTION 'Saque mínimo: R$ 50,00';
  END IF;

  IF NULLIF(btrim(COALESCE(_pix_key, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a chave PIX';
  END IF;

  IF _source NOT IN ('coach', 'partner', 'professional') THEN
    RAISE EXCEPTION 'Origem de saque inválida';
  END IF;

  -- Serializa qualquer solicitação do mesmo titular, inclusive entre abas.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_profile_id::text, 0));

  SELECT * INTO v_can FROM public.can_withdraw(v_profile_id);
  IF NOT COALESCE(v_can.allowed, false) THEN
    RAISE EXCEPTION 'Saque bloqueado: %', COALESCE(v_can.reason, 'indisponível');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.withdrawal_requests wr
    WHERE wr.profile_id = v_profile_id
      AND wr.status IN ('requested', 'approved', 'processing')
  ) OR EXISTS (
    SELECT 1
    FROM public.student_withdrawal_requests swr
    JOIN public.students s ON s.id = swr.student_id
    WHERE s.profile_id = v_profile_id
      AND swr.status IN ('requested', 'approved', 'processing')
  ) THEN
    RAISE EXCEPTION 'Você já tem uma solicitação pendente. Cancele antes de refazer.';
  END IF;

  IF _source = 'partner' THEN
    SELECT p.id INTO v_partner_id
    FROM public.partners p
    WHERE p.profile_id = v_profile_id
      AND (_entity_id IS NULL OR p.id = _entity_id)
    ORDER BY (p.status = 'approved') DESC, p.created_at ASC
    LIMIT 1;
    IF v_partner_id IS NULL THEN RAISE EXCEPTION 'Parceiro não encontrado para este perfil'; END IF;
  ELSIF _source = 'professional' THEN
    SELECT c.id INTO v_professional_coach_id
    FROM public.coaches c
    WHERE c.profile_id = v_profile_id
      AND (_entity_id IS NULL OR c.id = _entity_id)
    LIMIT 1;
    IF v_professional_coach_id IS NULL THEN RAISE EXCEPTION 'Profissional não encontrado para este perfil'; END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.coaches c
      WHERE c.profile_id = v_profile_id
        AND (_entity_id IS NULL OR c.id = _entity_id)
    ) THEN
      RAISE EXCEPTION 'Coach não encontrado para este perfil';
    END IF;
  END IF;

  -- Atualiza primeiro todas as carteiras com as mesmas regras usadas nos relatórios.
  PERFORM public.recalc_wallets_for_owner(v_profile_id);

  -- Trava as linhas financeiras até a criação e reserva do pedido terminarem.
  PERFORM 1 FROM public.wallets w WHERE w.profile_id = v_profile_id FOR UPDATE;
  PERFORM 1 FROM public.partner_wallets pw
    JOIN public.partners p ON p.id = pw.partner_id
    WHERE p.profile_id = v_profile_id FOR UPDATE OF pw;
  PERFORM 1 FROM public.professional_wallets profw
    JOIN public.coaches c ON c.id = profw.professional_coach_id
    WHERE c.profile_id = v_profile_id FOR UPDATE OF profw;

  -- O saldo é o mesmo que a pessoa vê na tela e o admin vê no painel. A soma
  -- das tabelas incluía `student_wallets`, que só guarda FitCoin — ponto, não
  -- dinheiro —, e deixava sacar FitCoin como se fosse saldo.
  SELECT COALESCE(c.disponivel, 0) INTO v_available
  FROM public.carteira_atual(v_profile_id) c;
  v_available := COALESCE(v_available, 0);

  IF round(_amount, 2) > round(v_available, 2) THEN
    RAISE EXCEPTION 'Saldo disponível insuficiente (R$ %)', to_char(v_available, 'FM999999990.00');
  END IF;

  INSERT INTO public.withdrawal_requests (
    profile_id, partner_id, professional_coach_id, amount,
    pix_key, pix_key_type, status, notes
  ) VALUES (
    v_profile_id, v_partner_id, v_professional_coach_id, round(_amount, 2),
    btrim(_pix_key), COALESCE(NULLIF(btrim(_pix_key_type), ''), 'other'), 'requested', NULLIF(btrim(COALESCE(_notes, '')), '')
  )
  RETURNING * INTO v_result;

  -- O trigger também recalcula; esta chamada explícita mantém a operação correta
  -- mesmo se a configuração de triggers mudar no futuro.
  PERFORM public.recalc_wallets_for_owner(v_profile_id);

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_seller_withdrawal_atomic(text, uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_seller_withdrawal_atomic(text, uuid, numeric, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.auditar_carteiras(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auditar_carteiras(boolean) TO service_role;

SELECT cron.schedule(
  'carteiras-acompanham-o-extrato',
  '17 * * * *',
  $cron$SELECT count(*) FROM public.auditar_carteiras(true)$cron$
);

-- Acerta agora quem já está velho.
SELECT count(*) FROM public.auditar_carteiras(true);
