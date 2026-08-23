-- MUDANÇA 04 — o fechamento mensal da rede
--
-- REGRA (decidida por você): comissão de rede de quem não bateu meta no mês
-- SOBE para o primeiro upline que bateu meta NAQUELE MESMO MÊS. Se ninguém na
-- linha acima bateu, vai para o SISTEMA.
--
-- Isto cria a tabela do razão e a função. NÃO executa o fechamento de mês
-- nenhum — rodar é um segundo passo, explícito, um mês por vez.
--
-- POR QUE NÃO MEXE NO CÁLCULO DE SALDO: a comissão transferida vai para o
-- status `cancelled`, que o `recalc_wallets_for_owner` já ignora hoje. Nenhuma
-- linha da função de saldo é tocada — que é a função mais quente do sistema e
-- foi reescrita anteontem.
-- ============================================================================
-- ── PASSO 1 — o razão do fechamento ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.network_month_transfers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_year         int  NOT NULL,
  period_month        int  NOT NULL,
  origin_commission_id uuid NOT NULL UNIQUE
                       REFERENCES public.commissions(id) ON DELETE CASCADE,
  from_profile_id     uuid NOT NULL REFERENCES public.profiles(id),
  to_profile_id       uuid          REFERENCES public.profiles(id),
  to_system           boolean NOT NULL DEFAULT false,
  amount              numeric(12,2) NOT NULL,
  levels_up           int,
  new_commission_id   uuid REFERENCES public.commissions(id),
  closed_by           uuid,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nmt_period ON public.network_month_transfers(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_nmt_from   ON public.network_month_transfers(from_profile_id);
CREATE INDEX IF NOT EXISTS idx_nmt_to     ON public.network_month_transfers(to_profile_id);

ALTER TABLE public.network_month_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nmt_admin_all" ON public.network_month_transfers
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid())
         OR from_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
         OR to_profile_id   IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));

GRANT SELECT ON public.network_month_transfers TO authenticated;
GRANT ALL    ON public.network_month_transfers TO service_role;

-- ── PASSO 2 — a função de fechamento ────────────────────────────────────────
-- Rode DEPOIS do PASSO 1, sozinha, e sozinha na execução.

CREATE OR REPLACE FUNCTION public.fechar_rede_do_mes(
  _ano int, _mes int, _admin_user_id uuid, _simular boolean DEFAULT true
)
RETURNS TABLE(acao text, de text, para text, comissoes bigint, valor numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn_fechamento$
DECLARE
  v_sem_snapshot int;
  v_admin_profile uuid;
  v_ref date := make_date(_ano, _mes, 1);
BEGIN
  IF NOT public.is_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  -- Trava 1: mês corrente ou futuro nunca fecha. O snapshot ainda não existe
  -- para quase ninguém, e fechar agora mandaria tudo para o sistema.
  IF v_ref >= date_trunc('month', now())::date THEN
    RAISE EXCEPTION 'O mes %/% ainda nao encerrou. So e possivel fechar mes ja terminado.', _mes, _ano;
  END IF;

  -- Trava 2: todo mundo com comissao de rede no mes precisa ter snapshot.
  -- Sem snapshot o codigo trata como "nao bateu", e a pessoa perderia o
  -- dinheiro por falta de calculo, nao por nao ter batido.
  SELECT count(DISTINCT c.beneficiary_profile_id) INTO v_sem_snapshot
    FROM public.commissions c
   WHERE COALESCE(c.is_network,false)
     AND EXTRACT(YEAR  FROM (c.created_at AT TIME ZONE 'UTC'))::int = _ano
     AND EXTRACT(MONTH FROM (c.created_at AT TIME ZONE 'UTC'))::int = _mes
     AND NOT EXISTS (SELECT 1 FROM public.network_unlock_history n
                      WHERE n.profile_id = c.beneficiary_profile_id
                        AND n.period_year = _ano AND n.period_month = _mes);

  IF COALESCE(v_sem_snapshot,0) > 0 THEN
    RAISE EXCEPTION 'Existem % pessoa(s) com comissao de rede em %/% e sem snapshot de meta. Rode o snapshot do mes antes de fechar.', v_sem_snapshot, _mes, _ano;
  END IF;

  SELECT id INTO v_admin_profile FROM public.profiles WHERE user_id = _admin_user_id;

  CREATE TEMP TABLE _plano ON COMMIT DROP AS
  WITH RECURSIVE presas AS (
    SELECT c.id AS cid, c.amount, c.beneficiary_profile_id AS de_profile,
           c.transaction_id, c.partner_order_id, c.slot_label,
           co.upline_coach_id AS proximo
      FROM public.commissions c
      JOIN public.coaches co ON co.profile_id = c.beneficiary_profile_id
     WHERE COALESCE(c.is_network,false) AND NOT COALESCE(c.is_referral,false)
       AND NOT COALESCE(c.force_released,false)
       AND c.status::text IN ('pending','available')
       AND EXTRACT(YEAR  FROM (c.created_at AT TIME ZONE 'UTC'))::int = _ano
       AND EXTRACT(MONTH FROM (c.created_at AT TIME ZONE 'UTC'))::int = _mes
       AND NOT COALESCE((SELECT n.any_completed FROM public.network_unlock_history n
                          WHERE n.profile_id = c.beneficiary_profile_id
                            AND n.period_year = _ano AND n.period_month = _mes), false)
       AND NOT EXISTS (SELECT 1 FROM public.network_month_transfers t
                        WHERE t.origin_commission_id = c.id)
  ),
  cadeia AS (
    SELECT p.cid, p.proximo AS coach_id, 1 AS nivel FROM presas p
    UNION ALL
    SELECT ch.cid, co.upline_coach_id, ch.nivel + 1
      FROM cadeia ch JOIN public.coaches co ON co.id = ch.coach_id
     WHERE ch.coach_id IS NOT NULL AND ch.nivel < 15
       AND NOT COALESCE((SELECT n.any_completed FROM public.network_unlock_history n
                          WHERE n.profile_id = co.profile_id
                            AND n.period_year = _ano AND n.period_month = _mes), false)
  ),
  achou AS (
    SELECT DISTINCT ON (ch.cid) ch.cid, ch.nivel, co.profile_id AS para
      FROM cadeia ch JOIN public.coaches co ON co.id = ch.coach_id
     WHERE COALESCE((SELECT n.any_completed FROM public.network_unlock_history n
                      WHERE n.profile_id = co.profile_id
                        AND n.period_year = _ano AND n.period_month = _mes), false)
     ORDER BY ch.cid, ch.nivel
  )
  SELECT p.cid, p.amount, p.de_profile, p.transaction_id, p.partner_order_id,
         p.slot_label, a.para, a.nivel
    FROM presas p LEFT JOIN achou a ON a.cid = p.cid;

  IF _simular THEN
    RETURN QUERY
      SELECT CASE WHEN pl.para IS NULL THEN 'iria para o SISTEMA' ELSE 'subiria para o upline' END,
             de.name, COALESCE(pa.name, '(sistema)'),
             count(*)::bigint, round(SUM(pl.amount),2)
        FROM _plano pl
        JOIN public.profiles de ON de.id = pl.de_profile
        LEFT JOIN public.profiles pa ON pa.id = pl.para
       GROUP BY 1, de.name, pa.name
       ORDER BY 5 DESC;
    RETURN;
  END IF;

  -- Grava a comissao nova para quem bateu meta
  WITH nova AS (
    INSERT INTO public.commissions
      (transaction_id, partner_order_id, beneficiary_profile_id, beneficiary_coach_id,
       level, percentage, amount, status, available_at, slot_label, is_network)
    SELECT pl.transaction_id, pl.partner_order_id, pl.para,
           (SELECT id FROM public.coaches WHERE profile_id = pl.para LIMIT 1),
           0, NULL, pl.amount, 'available'::commission_status, now(),
           'Rede recebida de ' || de.name || ' (' || lpad(_mes::text,2,'0') || '/' || _ano || ')',
           false
      FROM _plano pl JOIN public.profiles de ON de.id = pl.de_profile
     WHERE pl.para IS NOT NULL
    RETURNING id, beneficiary_profile_id, amount
  )
  INSERT INTO public.network_month_transfers
    (period_year, period_month, origin_commission_id, from_profile_id,
     to_profile_id, to_system, amount, levels_up, new_commission_id, closed_by)
  SELECT _ano, _mes, pl.cid, pl.de_profile, pl.para, false, pl.amount, pl.nivel,
         (SELECT n.id FROM nova n
           WHERE n.beneficiary_profile_id = pl.para AND n.amount = pl.amount
           LIMIT 1),
         v_admin_profile
    FROM _plano pl WHERE pl.para IS NOT NULL;

  -- O que nao achou dono vai para o sistema
  INSERT INTO public.admin_system_wallet_entries (slot_label, amount, kind, notes, created_at)
  SELECT 'Rede nao liberada — ' || de.name || ' (' || lpad(_mes::text,2,'0') || '/' || _ano || ')',
         pl.amount, 'credit', 'fechamento de rede', now()
    FROM _plano pl JOIN public.profiles de ON de.id = pl.de_profile
   WHERE pl.para IS NULL;

  UPDATE public.admin_system_wallet
     SET available_balance = available_balance + COALESCE((SELECT SUM(amount) FROM _plano WHERE para IS NULL), 0),
         total_earned      = total_earned      + COALESCE((SELECT SUM(amount) FROM _plano WHERE para IS NULL), 0),
         updated_at = now()
   WHERE id = true;

  INSERT INTO public.network_month_transfers
    (period_year, period_month, origin_commission_id, from_profile_id,
     to_profile_id, to_system, amount, levels_up, closed_by)
  SELECT _ano, _mes, pl.cid, pl.de_profile, NULL, true, pl.amount, NULL, v_admin_profile
    FROM _plano pl WHERE pl.para IS NULL;

  -- A comissao original sai do saldo de quem nao bateu.
  -- `cancelled` ja e ignorado pelo recalc_wallets_for_owner de hoje.
  UPDATE public.commissions c
     SET status = 'cancelled'::commission_status
   WHERE c.id IN (SELECT cid FROM _plano);

  -- Recalcula as carteiras de todo mundo que entrou ou saiu
  PERFORM public.recalc_wallets_for_owner(x.pid)
     FROM (SELECT DISTINCT de_profile AS pid FROM _plano
           UNION SELECT DISTINCT para FROM _plano WHERE para IS NOT NULL) x
    WHERE x.pid IS NOT NULL;

  RETURN QUERY
    SELECT CASE WHEN pl.para IS NULL THEN 'foi para o SISTEMA' ELSE 'subiu para o upline' END,
           de.name, COALESCE(pa.name, '(sistema)'),
           count(*)::bigint, round(SUM(pl.amount),2)
      FROM _plano pl
      JOIN public.profiles de ON de.id = pl.de_profile
      LEFT JOIN public.profiles pa ON pa.id = pl.para
     GROUP BY 1, de.name, pa.name
     ORDER BY 5 DESC;
END;
$fn_fechamento$;

REVOKE ALL ON FUNCTION public.fechar_rede_do_mes(int,int,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fechar_rede_do_mes(int,int,uuid,boolean) TO authenticated, service_role;
