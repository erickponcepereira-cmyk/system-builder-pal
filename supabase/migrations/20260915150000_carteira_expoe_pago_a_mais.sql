-- A carteira passa a mostrar o que foi pago além do liberado.
--
-- `disponivel` tem piso em zero, então quem sacou mais do que tinha liberado
-- aparecia como "R$ 0,00" — igualzinho a quem está zerado de verdade. São
-- situações opostas: um não tem nada a receber, o outro está devendo.
--
-- `pago_a_mais` é esse débito, e `a_receber_depois` é o que sobra quando o
-- pendente vencer e cobrir a diferença. É este último o número para planejar o
-- próximo pagamento: positivo significa que ainda há o que pagar; negativo
-- significa que a pessoa recebeu adiantado e não há pendente que cubra.
--
-- Não é preciso mexer em nada à mão para "acertar": o piso em zero já impede
-- saque novo, e o pendente que liberar abate o débito sozinho.
DROP FUNCTION IF EXISTS public.carteira_atual(uuid);

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
  WITH alvo AS (
    SELECT p.id, p.name::text AS nome, p.user_id
      FROM public.profiles p
     WHERE _profile_id IS NULL OR p.id = _profile_id
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

REVOKE ALL ON FUNCTION public.carteira_atual(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carteira_atual(uuid) TO authenticated;
