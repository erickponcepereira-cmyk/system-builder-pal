-- A auditoria passa a cobrir as TRÊS carteiras, não só a do coach.
--
-- A versão anterior só olhava `wallets` (source_kind 'coach'). Mas o dinheiro
-- mora em três lugares — `wallets`, `partner_wallets` e `professional_wallets` —
-- e é justamente nos dois últimos que vive a co-produção. Um co-produtor com a
-- carteira errada passava despercebido: o caso que revelou isso foi o Leandro,
-- com R$ 10,36 a mais em `professional_wallets.pending_balance` do que o extrato
-- mostrava, enquanto a auditoria dizia "tudo certo".
--
-- `total_earned` e `pending_balance` são soma direta do ledger e servem de
-- invariante. `available_balance` e `total_withdrawn` NÃO entram na comparação
-- de propósito: `recalc_wallets_for_owner` rateia os saques entre as três
-- carteiras por uma razão (`v_ratio`) em vez de atribuir cada saque à sua
-- origem, então o valor por carteira é uma fração e não bate com nada
-- verificável. O que se checa aqui é saldo negativo, que nunca é legítimo.
CREATE OR REPLACE FUNCTION public.auditar_carteiras(_corrigir boolean DEFAULT false)
RETURNS TABLE (
  profile_id           uuid,
  nome                 text,
  carteira             text,
  ganho_na_carteira    numeric,
  ganho_no_extrato     numeric,
  pendente_na_carteira numeric,
  pendente_no_extrato  numeric,
  saldo_negativo       boolean,
  corrigida            boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  WITH eventos AS (
    SELECT p.id AS pid, p.name::text AS nome, e.source_kind, e.source_type,
           e.wallet_owner_id, e.amount, e.state
      FROM public.profiles p
      CROSS JOIN LATERAL public.financial_ledger_events(p.id) e
     WHERE EXISTS (SELECT 1 FROM public.wallets w WHERE w.profile_id = p.id
                    AND COALESCE(w.is_test,false) = false)
  ),
  -- Uma linha por carteira existente, com o que ela mostra e o que o extrato diz.
  comparacao AS (
    SELECT w.profile_id AS pid, ev.nome, 'coach'::text AS carteira,
           w.total_earned, w.pending_balance, w.available_balance,
           ROUND(COALESCE(SUM(ev.amount), 0), 2) AS ganho,
           ROUND(COALESCE(SUM(ev.amount) FILTER (WHERE ev.state IN ('hold','network_blocked')), 0), 2) AS pendente
      FROM public.wallets w
      LEFT JOIN eventos ev ON ev.pid = w.profile_id
                          AND ev.source_kind = 'coach' AND ev.source_type = 'commission'
     WHERE COALESCE(w.is_test,false) = false
     GROUP BY w.profile_id, ev.nome, w.total_earned, w.pending_balance, w.available_balance

    UNION ALL

    SELECT pa.profile_id, ev.nome, 'parceiro',
           pw.total_earned, pw.pending_balance, pw.available_balance,
           ROUND(COALESCE(SUM(ev.amount), 0), 2),
           ROUND(COALESCE(SUM(ev.amount) FILTER (WHERE ev.state IN ('hold','network_blocked')), 0), 2)
      FROM public.partner_wallets pw
      JOIN public.partners pa ON pa.id = pw.partner_id
      LEFT JOIN eventos ev ON ev.pid = pa.profile_id
                          AND ev.source_kind = 'partner' AND ev.wallet_owner_id = pw.partner_id
     GROUP BY pa.profile_id, ev.nome, pw.total_earned, pw.pending_balance, pw.available_balance

    UNION ALL

    SELECT c.profile_id, ev.nome, 'profissional',
           fw.total_earned, fw.pending_balance, fw.available_balance,
           ROUND(COALESCE(SUM(ev.amount), 0), 2),
           ROUND(COALESCE(SUM(ev.amount) FILTER (WHERE ev.state IN ('hold','network_blocked')), 0), 2)
      FROM public.professional_wallets fw
      JOIN public.coaches c ON c.id = fw.professional_coach_id
      LEFT JOIN eventos ev ON ev.pid = c.profile_id
                          AND ev.source_kind = 'professional' AND ev.wallet_owner_id = fw.professional_coach_id
     GROUP BY c.profile_id, ev.nome, fw.total_earned, fw.pending_balance, fw.available_balance
  ),
  divergentes AS (
    SELECT * FROM comparacao
     WHERE ABS(total_earned    - ganho)    > 0.01
        OR ABS(pending_balance - pendente) > 0.01
        OR available_balance < 0
  ),
  -- Recalcula o dono uma vez só, mesmo que ele tenha as três carteiras erradas.
  aplicado AS (
    SELECT x.pid, public.recalc_wallets_for_owner(x.pid) AS _
      FROM (SELECT DISTINCT d.pid FROM divergentes d WHERE _corrigir) x
  )
  SELECT d.pid, d.nome, d.carteira, d.total_earned, d.ganho,
         d.pending_balance, d.pendente, (d.available_balance < 0),
         _corrigir AND EXISTS (SELECT 1 FROM aplicado a WHERE a.pid = d.pid)
    FROM divergentes d
   ORDER BY ABS(d.total_earned - d.ganho) + ABS(d.pending_balance - d.pendente) DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.auditar_carteiras(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auditar_carteiras(boolean) TO authenticated;
