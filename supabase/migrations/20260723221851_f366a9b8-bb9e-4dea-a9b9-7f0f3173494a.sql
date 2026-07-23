DROP POLICY IF EXISTS "pfr select own student" ON public.partner_freebie_reservations;
DROP POLICY IF EXISTS "pfr select partner owner" ON public.partner_freebie_reservations;

CREATE POLICY "Students can read their own freebie reservations"
ON public.partner_freebie_reservations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = partner_freebie_reservations.profile_id
      AND pr.user_id = auth.uid()
  )
);

CREATE POLICY "Partners and admins can read establishment reservations"
ON public.partner_freebie_reservations
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR EXISTS (
    SELECT 1
    FROM public.partners pa
    JOIN public.profiles pr ON pr.id = pa.profile_id
    WHERE pa.id = partner_freebie_reservations.partner_id
      AND pr.user_id = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.cancel_partner_freebie(_reservation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r public.partner_freebie_reservations%ROWTYPE;
  v_uid uuid := auth.uid();
  v_profile_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  SELECT * INTO r
  FROM public.partner_freebie_reservations
  WHERE id = _reservation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva não encontrada';
  END IF;

  IF r.profile_id <> v_profile_id AND NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  IF r.status <> 'reserved' THEN
    RAISE EXCEPTION 'Reserva não pode ser cancelada';
  END IF;

  IF r.slot_start <= now() THEN
    RAISE EXCEPTION 'Não é possível cancelar após o início do horário';
  END IF;

  UPDATE public.partner_freebie_reservations
     SET status = 'cancelled', cancelled_at = now()
   WHERE id = _reservation_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cancel_partner_freebie(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.redeem_partner_freebie(_qr_token text)
RETURNS TABLE(reservation_id uuid, student_name text, product_name text, slot_start timestamp with time zone, slot_end timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  r public.partner_freebie_reservations%ROWTYPE;
  v_is_owner boolean;
  v_student_name text;
  v_product_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE user_id = v_uid
  LIMIT 1;

  IF v_profile_id IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  SELECT * INTO r
  FROM public.partner_freebie_reservations
  WHERE qr_token = trim(_qr_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'QR inválido';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.partners pa
    WHERE pa.id = r.partner_id
      AND (pa.profile_id = v_profile_id OR public.is_admin(v_uid))
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Este QR não pertence ao seu estabelecimento';
  END IF;

  IF r.status = 'used' THEN
    RAISE EXCEPTION 'QR já utilizado';
  END IF;

  IF r.status = 'cancelled' THEN
    RAISE EXCEPTION 'Reserva cancelada';
  END IF;

  IF r.status = 'expired' THEN
    RAISE EXCEPTION 'Produto fora do horário de utilização';
  END IF;

  IF r.status <> 'reserved' THEN
    RAISE EXCEPTION 'Reserva % não pode ser usada', r.status;
  END IF;

  IF now() < r.slot_start THEN
    RAISE EXCEPTION 'Produto fora do horário de utilização. Libera em %', to_char(r.slot_start AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI');
  END IF;

  IF now() > r.slot_end THEN
    UPDATE public.partner_freebie_reservations
       SET status = 'expired'
     WHERE id = r.id;
    RAISE EXCEPTION 'Produto fora do horário de utilização';
  END IF;

  UPDATE public.partner_freebie_reservations
     SET status = 'used', used_at = now(), scanned_by_profile_id = v_profile_id
   WHERE id = r.id;

  SELECT pr.name INTO v_student_name
  FROM public.profiles pr
  WHERE pr.id = r.profile_id;

  SELECT pp.name INTO v_product_name
  FROM public.partner_products pp
  WHERE pp.id = r.partner_product_id;

  RETURN QUERY SELECT r.id, COALESCE(v_student_name, 'Aluno'), COALESCE(v_product_name, 'Produto'), r.slot_start, r.slot_end;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.redeem_partner_freebie(text) TO authenticated;