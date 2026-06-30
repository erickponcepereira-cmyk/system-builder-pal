CREATE OR REPLACE FUNCTION public.set_partner_product_schedules(
  _product_id uuid,
  _schedules jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner_profile_id uuid;  -- profiles.id of the partner owner
  v_my_profile_id uuid;
  rec jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT p.profile_id INTO v_partner_profile_id
    FROM public.partner_products pp
    JOIN public.partners p ON p.id = pp.partner_id
   WHERE pp.id = _product_id;
  IF v_partner_profile_id IS NULL THEN RAISE EXCEPTION 'Produto não encontrado'; END IF;

  SELECT id INTO v_my_profile_id FROM public.profiles WHERE user_id = v_uid;

  IF v_partner_profile_id <> v_my_profile_id AND NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  DELETE FROM public.partner_product_schedules WHERE partner_product_id = _product_id;
  FOR rec IN SELECT * FROM jsonb_array_elements(COALESCE(_schedules,'[]'::jsonb)) LOOP
    INSERT INTO public.partner_product_schedules(
      partner_product_id, weekday, start_time, end_time, capacity, active
    ) VALUES (
      _product_id,
      (rec->>'weekday')::smallint,
      (rec->>'start_time')::time,
      (rec->>'end_time')::time,
      COALESCE((rec->>'capacity')::int, 1),
      true
    );
  END LOOP;
  UPDATE public.partner_products
     SET uses_scheduling = (jsonb_array_length(COALESCE(_schedules,'[]'::jsonb)) > 0)
   WHERE id = _product_id;
END $$;