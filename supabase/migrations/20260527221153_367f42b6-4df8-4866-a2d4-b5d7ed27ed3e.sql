CREATE OR REPLACE FUNCTION public.register_admin_wallet_debit(p_amount numeric, p_description text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_master boolean;
  v_entry_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  SELECT COALESCE(is_master_admin, false) INTO v_is_master
    FROM public.profiles WHERE user_id = v_user_id AND role = 'admin';
  IF NOT COALESCE(v_is_master, false) THEN
    RAISE EXCEPTION 'Acesso negado: apenas master admins';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Valor inválido';
  END IF;

  INSERT INTO public.admin_system_wallet_entries (transaction_id, slot_label, amount, kind)
  VALUES (NULL, COALESCE(NULLIF(trim(p_description), ''), 'Saque/Repasse'), p_amount, 'debit')
  RETURNING id INTO v_entry_id;

  UPDATE public.admin_system_wallet
  SET available_balance = available_balance - p_amount,
      total_withdrawn = total_withdrawn + p_amount,
      updated_at = now()
  WHERE id = true;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_admin_wallet_debit(numeric, text) TO authenticated;