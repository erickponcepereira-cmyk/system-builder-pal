CREATE OR REPLACE FUNCTION public.admin_release_user_subscription(_user_id uuid, _reason text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _actor uuid := auth.uid();
  _count int := 0;
  _inv record;
BEGIN
  IF NOT public.is_admin(_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  FOR _inv IN
    SELECT id, status FROM public.subscription_invoices
    WHERE user_id = _user_id AND status IN ('blocked','overdue','pending')
  LOOP
    UPDATE public.subscription_invoices
      SET status = 'exempted', paid_at = COALESCE(paid_at, now()), updated_at = now()
      WHERE id = _inv.id;

    INSERT INTO public.subscription_invoice_audit (invoice_id, actor_id, action, from_status, to_status, meta)
    VALUES (_inv.id, _actor, 'admin_release_access', _inv.status::text, 'exempted',
            jsonb_build_object('reason', COALESCE(_reason, 'Liberação de acesso pelo admin')));

    _count := _count + 1;
  END LOOP;

  RETURN _count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_release_user_subscription(uuid, text) TO authenticated;