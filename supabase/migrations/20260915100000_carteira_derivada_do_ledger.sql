-- A carteira passa a ser calculada, não guardada.
--
-- O problema que isto encerra: `wallets` (e as irmãs `partner_wallets` e
-- `professional_wallets`) são tabelas materializadas, mas a verdade depende do
-- RELÓGIO — uma comissão sai de `hold` para `available` quando
-- `available_at <= now()`, e nesse instante não acontece evento nenhum que avise
-- a tabela. Então algumas carteiras passavam a discordar do extrato sozinhas,
-- sem ninguém ter feito nada. Em uma única sessão, quatro divergiram em minutos.
-- Nenhuma quantidade de recálculo resolve isso: a tabela sempre volta a
-- envelhecer no minuto seguinte.
--
-- A segunda coisa que isto conserta é o rateio. `recalc_wallets_for_owner`
-- dividia os saques entre as três carteiras por uma razão (`v_ratio`), porque o
-- saldo real é UM só por pessoa e ele precisava parti-lo em três. Daí a carteira
-- da Julia mostrar "R$ 0,01 disponível" no coach e R$ 0,01 no parceiro: ela tem
-- R$ 0,02 no total, e o rateio espalhou. As três carteiras nunca foram caixas
-- separadas — são a ORIGEM do que foi ganho. Saque e gasto não pertencem a
-- nenhuma delas, e é por isso que dividir dava número sem sentido.
--
-- A conta aqui é a mesma de `wallet_statement`, que já estava certa:
--   disponível = liberado − saques pagos − saques em aberto − gasto − adiantamento
CREATE OR REPLACE FUNCTION public.carteira_atual(_profile_id uuid DEFAULT NULL)
RETURNS TABLE (
  profile_id          uuid,
  nome                text,
  ganho               numeric,
  liberado            numeric,
  pendente            numeric,
  bloqueado_por_meta  numeric,
  sacado              numeric,
  saque_em_aberto     numeric,
  gasto_na_plataforma numeric,
  adiantamento_aberto numeric,
  disponivel          numeric,
  ganho_coach         numeric,
  ganho_parceiro      numeric,
  ganho_profissional  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH alvo AS (
    -- Sem argumento devolve a base inteira; com um perfil, só ele.
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
           SUM(amount)                                                  AS ganho,
           SUM(amount) FILTER (WHERE state = 'available')               AS liberado,
           SUM(amount) FILTER (WHERE state = 'hold')                    AS pendente,
           SUM(amount) FILTER (WHERE state = 'network_blocked')         AS bloqueado,
           SUM(amount) FILTER (WHERE source_kind = 'coach')             AS de_coach,
           SUM(amount) FILTER (WHERE source_kind = 'partner')           AS de_parceiro,
           SUM(amount) FILTER (WHERE source_kind = 'professional')      AS de_profissional
      FROM evento GROUP BY pid
  ),
  saque AS (
    SELECT w.profile_id AS pid,
           SUM(w.amount) FILTER (WHERE w.status = 'paid')                                    AS pago,
           SUM(w.amount) FILTER (WHERE w.status IN ('requested','approved','processing'))    AS aberto
      FROM public.withdrawal_requests w
      JOIN alvo a ON a.id = w.profile_id
     GROUP BY w.profile_id
  ),
  -- Aluno que indica saca por outra porta; o saldo é da mesma pessoa.
  saque_aluno AS (
    SELECT s.profile_id AS pid,
           SUM(sw.amount) FILTER (WHERE sw.status::text = 'paid')                                 AS pago,
           SUM(sw.amount) FILTER (WHERE sw.status::text IN ('requested','approved','processing')) AS aberto
      FROM public.student_withdrawal_requests sw
      JOIN public.students s ON s.id = sw.student_id
      JOIN alvo a ON a.id = s.profile_id
     GROUP BY s.profile_id
  ),
  -- Gasto dentro da plataforma: some do saldo sem virar pedido de saque, e era
  -- o que fazia a conta "comissão menos saques" não fechar.
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
    SELECT av.profile_id AS pid,
           SUM(GREATEST(av.amount - av.settled_amount, 0)) AS aberto
      FROM public.wallet_advances av
      JOIN alvo a ON a.id = av.profile_id
     GROUP BY av.profile_id
  ),
  junto AS (
    SELECT a.id, a.nome,
           COALESCE(l.ganho, 0)      AS ganho,
           COALESCE(l.liberado, 0)   AS liberado,
           COALESCE(l.pendente, 0)   AS pendente,
           COALESCE(l.bloqueado, 0)  AS bloqueado,
           COALESCE(sq.pago, 0)   + COALESCE(sa.pago, 0)   AS sacado,
           COALESCE(sq.aberto, 0) + COALESCE(sa.aberto, 0) AS saque_aberto,
           COALESCE(gm.valor, 0) + COALESCE(gl.valor, 0) + COALESCE(gp.valor, 0) AS gasto,
           COALESCE(ad.aberto, 0)    AS adiantamento,
           COALESCE(l.de_coach, 0)        AS de_coach,
           COALESCE(l.de_parceiro, 0)     AS de_parceiro,
           COALESCE(l.de_profissional, 0) AS de_profissional
      FROM alvo a
      LEFT JOIN ledger l            ON l.pid  = a.id
      LEFT JOIN saque sq            ON sq.pid = a.id
      LEFT JOIN saque_aluno sa      ON sa.pid = a.id
      LEFT JOIN gasto_mensalidade gm ON gm.pid = a.id
      LEFT JOIN gasto_loja gl       ON gl.pid = a.id
      LEFT JOIN gasto_parceiro gp   ON gp.pid = a.id
      LEFT JOIN adiantamento ad     ON ad.pid = a.id
     WHERE l.pid IS NOT NULL OR sq.pid IS NOT NULL OR sa.pid IS NOT NULL
  )
  SELECT id, nome,
         ROUND(ganho, 2), ROUND(liberado, 2), ROUND(pendente, 2), ROUND(bloqueado, 2),
         ROUND(sacado, 2), ROUND(saque_aberto, 2), ROUND(gasto, 2), ROUND(adiantamento, 2),
         ROUND(GREATEST(liberado - sacado - saque_aberto - gasto - adiantamento, 0), 2),
         ROUND(de_coach, 2), ROUND(de_parceiro, 2), ROUND(de_profissional, 2)
    FROM junto;
$fn$;

REVOKE ALL ON FUNCTION public.carteira_atual(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carteira_atual(uuid) TO authenticated;
