
CREATE OR REPLACE FUNCTION public.recalc_nutritionist_wallets()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE nutritionist_wallets w
  SET blocked_balance = COALESCE((
        SELECT SUM(amount) FROM nutritionist_blocked_entries
        WHERE profile_id = w.profile_id AND status = 'blocked'
      ), 0),
      total_earned = COALESCE((
        SELECT SUM(amount) FROM nutritionist_blocked_entries
        WHERE profile_id = w.profile_id AND status IN ('blocked','released')
      ), 0),
      total_released = COALESCE((
        SELECT SUM(amount) FROM nutritionist_blocked_entries
        WHERE profile_id = w.profile_id AND status = 'released'
      ), 0),
      available_balance = GREATEST(0, COALESCE((
        SELECT SUM(amount) FROM nutritionist_blocked_entries
        WHERE profile_id = w.profile_id AND status = 'released'
      ), 0) - COALESCE(w.total_withdrawn, 0)),
      updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalc_nutritionist_wallets() TO service_role;
