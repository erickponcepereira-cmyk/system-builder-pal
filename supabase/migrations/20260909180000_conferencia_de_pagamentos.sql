-- Uma fonte só para "quem eu pago e quanto".
--
-- O problema: o painel de pagamentos lê `wallets`/`partner_wallets`/
-- `professional_wallets`, que são tabelas materializadas por
-- `recalc_wallets_for_owner`. Só que o ledger deriva do TEMPO — uma comissão
-- vira disponível quando `available_at <= now()`, sem nenhum evento. Ninguém
-- avisa a carteira quando o relógio passa da data, então ela envelhece sozinha.
-- Vencem comissões todo dia (32 em 09/09/2026, 19 em 10/09), e a cada
-- vencimento o painel passa a mostrar o número de ontem. Era isso que
-- "quebrava o painel toda semana" — na verdade quebrava todo dia.
--
-- Esta função não confia em carteira: calcula na hora, com a MESMA fórmula de
-- `wallet_statement`:
--
--   disponível = liberado − sacado − saque em aberto − gasto na carteira − adiantamento
--
-- Os três últimos termos são fáceis de esquecer e mudam o resultado: quem tem
-- saque em análise ou adiantamento aberto não pode receber de novo.
--
-- `carteira_diz` e `divergencia` vêm junto de propósito: quando divergem, a
-- tabela materializada está velha, e dá para ver de quanto.
--
-- Conferida em 09/09/2026 contra dois casos reais:
--   Vimark    — ganhou 2.878,10, sacou 2.760,79, 114,00 de rede bloqueada
--               e 3,31 em espera → pagar 0,00, divergência 0,00
--   Marilene  — 701,01 a pagar contra 639,49 na carteira: 61,52 venceram
--               depois do último recálculo
CREATE OR REPLACE FUNCTION public.admin_conferencia_pagamentos(_profile_id uuid DEFAULT NULL)
RETURNS TABLE (
  profile_id uuid, nome text, papel text,
  pagar_agora numeric, em_espera numeric, rede_bloqueada numeric,
  ganho_total numeric, ja_sacado numeric, saque_em_aberto numeric,
  gasto_na_carteira numeric, adiantamento_aberto numeric,
  carteira_diz numeric, divergencia numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  WITH led AS (
    SELECT e.beneficiary_profile_id AS pid,
           round(sum(e.amount) FILTER (WHERE e.state='available'), 2)       AS released,
           round(sum(e.amount) FILTER (WHERE e.state='hold'), 2)            AS hold,
           round(sum(e.amount) FILTER (WHERE e.state='network_blocked'), 2) AS blocked,
           round(sum(e.amount), 2)                                          AS earned
      FROM public.financial_ledger_events(_profile_id) e
     WHERE e.source_kind <> 'fitcoin'
     GROUP BY 1
  ),
  saq AS (
    SELECT w.profile_id AS pid,
           round(coalesce(sum(w.amount) FILTER (WHERE w.status::text='paid'),0),2) AS pago,
           round(coalesce(sum(w.amount) FILTER (WHERE w.status::text IN ('requested','approved','processing')),0),2) AS aberto
      FROM public.withdrawal_requests w
     WHERE _profile_id IS NULL OR w.profile_id = _profile_id
     GROUP BY 1
  ),
  gasto AS (
    SELECT pid, round(sum(v),2) AS total FROM (
      SELECT pr.id AS pid, si.amount AS v
        FROM public.subscription_invoices si
        JOIN public.profiles pr ON pr.user_id = si.user_id
       WHERE si.status='paid' AND si.payment_method='wallet'
         AND (_profile_id IS NULL OR pr.id = _profile_id)
      UNION ALL
      SELECT st.profile_id, so.total_amount
        FROM public.store_orders so JOIN public.students st ON st.id = so.student_id
       WHERE so.status='paid' AND so.payment_method::text='wallet'
         AND (_profile_id IS NULL OR st.profile_id = _profile_id)
      UNION ALL
      SELECT st.profile_id, po.gross_amount
        FROM public.partner_product_orders po JOIN public.students st ON st.id = po.student_id
       WHERE po.status='paid' AND po.payment_method='wallet'
         AND (_profile_id IS NULL OR st.profile_id = _profile_id)
    ) x GROUP BY pid
  ),
  adiant AS (
    SELECT a.profile_id AS pid, round(coalesce(sum(GREATEST(a.amount - a.settled_amount,0)),0),2) AS aberto
      FROM public.wallet_advances a
     WHERE _profile_id IS NULL OR a.profile_id = _profile_id
     GROUP BY 1
  ),
  mat AS (
    SELECT pr.id AS pid,
           round(coalesce((SELECT w.available_balance FROM public.wallets w WHERE w.profile_id=pr.id),0)
               + coalesce((SELECT sum(pw.available_balance) FROM public.partner_wallets pw
                            JOIN public.partners pa ON pa.id=pw.partner_id WHERE pa.profile_id=pr.id),0)
               + coalesce((SELECT sum(cw.available_balance) FROM public.professional_wallets cw
                            JOIN public.coaches co ON co.id=cw.professional_coach_id WHERE co.profile_id=pr.id),0),2) AS disponivel
      FROM public.profiles pr
     WHERE _profile_id IS NULL OR pr.id = _profile_id
  )
  SELECT pr.id, pr.name, pr.role::text,
         round(GREATEST(coalesce(l.released,0) - coalesce(s.pago,0) - coalesce(s.aberto,0)
                        - coalesce(g.total,0) - coalesce(ad.aberto,0), 0), 2),
         coalesce(l.hold,0), coalesce(l.blocked,0), coalesce(l.earned,0),
         coalesce(s.pago,0), coalesce(s.aberto,0), coalesce(g.total,0), coalesce(ad.aberto,0),
         coalesce(m.disponivel,0),
         round(GREATEST(coalesce(l.released,0) - coalesce(s.pago,0) - coalesce(s.aberto,0)
                        - coalesce(g.total,0) - coalesce(ad.aberto,0), 0) - coalesce(m.disponivel,0), 2)
    FROM public.profiles pr
    LEFT JOIN led l ON l.pid = pr.id
    LEFT JOIN saq s ON s.pid = pr.id
    LEFT JOIN gasto g ON g.pid = pr.id
    LEFT JOIN adiant ad ON ad.pid = pr.id
    LEFT JOIN mat m ON m.pid = pr.id
   WHERE (_profile_id IS NULL OR pr.id = _profile_id)
     AND (coalesce(l.earned,0) <> 0 OR coalesce(s.pago,0) <> 0 OR coalesce(s.aberto,0) <> 0)
   ORDER BY 4 DESC;
$fn$;

REVOKE ALL ON FUNCTION public.admin_conferencia_pagamentos(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_conferencia_pagamentos(uuid) TO authenticated;
