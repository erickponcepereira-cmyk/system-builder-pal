
-- 1) Desativa atribuição automática de nutricionista
CREATE OR REPLACE FUNCTION public.find_nutritionist_for(_coach_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULL::uuid;
$$;

-- 2) Limpa saldos de nutricionista (bloqueado/total) e os lançamentos pendentes
DELETE FROM public.nutritionist_blocked_entries;
UPDATE public.nutritionist_wallets
   SET available_balance = 0,
       blocked_balance   = 0,
       total_earned      = 0,
       total_withdrawn   = 0,
       updated_at        = now();

-- 3) Remove atribuições de nutricionista existentes (para limpar testes)
DELETE FROM public.sale_nutritionist_assignments;

-- 4) Zera saldos órfãos: carteiras com saldo mas sem comissão de origem
UPDATE public.wallets w
   SET available_balance = 0,
       pending_balance   = 0,
       total_earned      = 0,
       updated_at        = now()
 WHERE NOT EXISTS (
   SELECT 1 FROM public.commissions c
    WHERE c.beneficiary_profile_id = w.profile_id
 );
