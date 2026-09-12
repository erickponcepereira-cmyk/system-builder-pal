-- Um lugar só para saber se as carteiras estão certas — e para corrigi-las.
--
-- Por que existe: `wallets` é uma tabela materializada, mas a verdade
-- (`financial_ledger_events`) depende do RELÓGIO. Uma comissão sai de `hold`
-- para `available` quando `available_at <= now()`; nada acontece nesse instante
-- para avisar a carteira. Então toda semana algumas carteiras passam a discordar
-- do extrato sozinhas, sem ninguém ter feito nada — e o painel de pagamentos
-- "quebra". Não havia como saber quais, nem consertar em lote: a auditoria
-- existente (`wallets_audit_invariant`) é um trigger, não dá para chamar.
--
-- `_corrigir => false` é só o diagnóstico. Com `true`, recalcula as divergentes
-- a partir do ledger, que é sempre a fonte.
CREATE OR REPLACE FUNCTION public.auditar_carteiras(_corrigir boolean DEFAULT false)
RETURNS TABLE (
  profile_id      uuid,
  nome            text,
  ganho_na_carteira   numeric,
  ganho_no_extrato    numeric,
  pendente_na_carteira numeric,
  pendente_no_extrato  numeric,
  corrigida       boolean
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
  WITH extrato AS (
    SELECT w.profile_id AS pid,
           ROUND(COALESCE(SUM(e.amount), 0), 2) AS ganho,
           ROUND(COALESCE(SUM(e.amount) FILTER (WHERE e.state IN ('hold','network_blocked')), 0), 2) AS pendente
      FROM public.wallets w
      LEFT JOIN LATERAL public.financial_ledger_events(w.profile_id) e
             ON e.source_kind = 'coach' AND e.source_type = 'commission'
     WHERE COALESCE(w.is_test, false) = false
     GROUP BY w.profile_id
  ),
  divergentes AS (
    SELECT w.profile_id AS pid, p.name::text AS name, w.total_earned, x.ganho,
           w.pending_balance, x.pendente
      FROM public.wallets w
      JOIN extrato x ON x.pid = w.profile_id
      JOIN public.profiles p ON p.id = w.profile_id
     WHERE ABS(w.total_earned    - x.ganho)    > 0.01
        OR ABS(w.pending_balance - x.pendente) > 0.01
        OR w.available_balance < 0
  ),
  aplicado AS (
    SELECT d.pid, public.recalc_wallets_for_owner(d.pid) AS _
      FROM divergentes d WHERE _corrigir
  )
  SELECT d.pid, d.name, d.total_earned, d.ganho, d.pending_balance, d.pendente,
         _corrigir AND EXISTS (SELECT 1 FROM aplicado a WHERE a.pid = d.pid)
    FROM divergentes d
   ORDER BY ABS(d.total_earned - d.ganho) + ABS(d.pending_balance - d.pendente) DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.auditar_carteiras(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auditar_carteiras(boolean) TO authenticated;
