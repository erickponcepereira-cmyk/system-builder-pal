
-- Auto-transfer downline to upline when a coach is deactivated/removed
CREATE OR REPLACE FUNCTION public.admin_block_and_transfer_to_upline(
  _coach_id uuid,
  _reason text DEFAULT 'Coach desativado pelo administrador.',
  _to_coach_id_override uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  admin_profile_id UUID;
  from_profile_id UUID;
  to_coach_id UUID;
  to_profile_id UUID;
  students_count INTEGER := 0;
  coaches_count INTEGER := 0;
  auto_picked BOOLEAN := false;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles WHERE user_id = auth.uid();

  SELECT profile_id, COALESCE(_to_coach_id_override, upline_coach_id)
  INTO from_profile_id, to_coach_id
  FROM public.coaches WHERE id = _coach_id;

  IF from_profile_id IS NULL THEN
    RAISE EXCEPTION 'Coach não encontrado';
  END IF;

  IF _to_coach_id_override IS NULL THEN
    auto_picked := true;
  END IF;

  IF to_coach_id IS NULL THEN
    RAISE EXCEPTION 'Coach não possui upline. Informe um coach destino manualmente.';
  END IF;

  IF to_coach_id = _coach_id THEN
    RAISE EXCEPTION 'Destino inválido (mesmo coach).';
  END IF;

  SELECT profile_id INTO to_profile_id
  FROM public.coaches
  WHERE id = to_coach_id AND approved_at IS NOT NULL AND blocked_at IS NULL;

  IF to_profile_id IS NULL THEN
    RAISE EXCEPTION 'Coach destino não está ativo. Informe outro destino.';
  END IF;

  -- Transfer downline
  UPDATE public.students SET coach_id = to_coach_id WHERE coach_id = _coach_id;
  GET DIAGNOSTICS students_count = ROW_COUNT;

  UPDATE public.coaches SET upline_coach_id = to_coach_id WHERE upline_coach_id = _coach_id;
  GET DIAGNOSTICS coaches_count = ROW_COUNT;

  -- Mark coach as blocked + transferred
  UPDATE public.coaches
  SET blocked_at = now(),
      blocked_reason = _reason,
      transferred_to_coach_id = to_coach_id,
      transferred_at = now(),
      inactive_since = COALESCE(inactive_since, CURRENT_DATE)
  WHERE id = _coach_id;

  UPDATE public.profiles SET status = 'blocked' WHERE id = from_profile_id;

  -- Audit
  INSERT INTO public.coach_transfers (
    from_coach_id, to_coach_id, reason, students_transferred, coaches_transferred, performed_by
  ) VALUES (
    _coach_id, to_coach_id,
    _reason || CASE WHEN auto_picked THEN ' (upline automático)' ELSE ' (destino manual)' END,
    students_count, coaches_count, admin_profile_id
  );

  INSERT INTO public.admin_audit_log (
    actor_profile_id, target_profile_id, action,
    before_role, after_role, before_permissions, after_permissions
  ) VALUES (
    admin_profile_id, from_profile_id, 'coach_blocked_with_transfer',
    NULL, NULL,
    jsonb_build_object('coach_id', _coach_id),
    jsonb_build_object(
      'to_coach_id', to_coach_id,
      'students_transferred', students_count,
      'coaches_transferred', coaches_count,
      'auto_picked_upline', auto_picked,
      'reason', _reason
    )
  );

  -- Notifications
  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  VALUES
    (from_profile_id, 'coach_blocked', 'Conta de coach desativada', _reason, '/coach'),
    (to_profile_id, 'network_received',
      'Nova rede recebida',
      format('Você recebeu %s aluno(s) e %s coach(es) de uma rede desativada.', students_count, coaches_count),
      '/coach');

  RETURN jsonb_build_object(
    'students_transferred', students_count,
    'coaches_transferred', coaches_count,
    'to_coach_id', to_coach_id,
    'auto_picked_upline', auto_picked
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_block_and_transfer_to_upline(uuid, text, uuid) TO authenticated;
