
DO $$
DECLARE
  v_tx uuid := '48649924-d78f-459b-b921-c57ef29e1584';
  v_comm RECORD;
BEGIN
  -- Reverte saldos das comissões pendentes antes de apagar
  FOR v_comm IN
    SELECT beneficiary_profile_id, amount
    FROM public.commissions
    WHERE transaction_id = v_tx
  LOOP
    UPDATE public.wallets
       SET available_balance = GREATEST(0, available_balance - v_comm.amount),
           total_earned     = GREATEST(0, total_earned     - v_comm.amount),
           updated_at       = now()
     WHERE profile_id = v_comm.beneficiary_profile_id;
  END LOOP;

  -- Limpa comissões, entradas do admin wallet e tokens de desafio ligados
  DELETE FROM public.admin_system_wallet_entries WHERE transaction_id = v_tx;
  DELETE FROM public.student_challenge_tokens   WHERE source_transaction_id = v_tx;
  DELETE FROM public.commissions                WHERE transaction_id = v_tx;
  DELETE FROM public.transactions               WHERE id = v_tx;
END $$;
