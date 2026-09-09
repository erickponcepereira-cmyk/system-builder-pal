-- Ressincroniza as carteiras materializadas que ficaram para trás.
--
-- Complemento de `admin_conferencia_pagamentos`: aquela mostra a verdade sem
-- tocar em nada, esta faz as tabelas alcançarem a verdade. Só mexe em quem
-- está defasado — o recálculo é caro e, a qualquer momento, a esmagadora
-- maioria das carteiras está correta. O que envelhece é a de quem teve
-- comissão vencendo desde o último recálculo.
--
-- Chame ao abrir o painel de pagamentos. Enquanto não existir pg_cron neste
-- projeto, é o que mantém a tabela honesta sem depender de alguém lembrar.
CREATE OR REPLACE FUNCTION public.admin_sincronizar_carteiras()
RETURNS TABLE (profile_id uuid, nome text, antes numeric, depois numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE r record;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas admin pode sincronizar carteiras';
  END IF;

  FOR r IN
    SELECT c.profile_id, c.nome, c.carteira_diz AS antes
      FROM public.admin_conferencia_pagamentos() c
     WHERE abs(c.divergencia) > 0.01
  LOOP
    PERFORM public.recalc_wallets_for_owner(r.profile_id);
    profile_id := r.profile_id;
    nome       := r.nome;
    antes      := r.antes;
    SELECT round(coalesce(w.available_balance,0),2) INTO depois
      FROM public.wallets w WHERE w.profile_id = r.profile_id;
    RETURN NEXT;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_sincronizar_carteiras() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_sincronizar_carteiras() TO authenticated;
