ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS inactivity_grace_until DATE,
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

CREATE OR REPLACE FUNCTION public.refresh_coach_inactivity()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count INTEGER := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.coaches c
  SET inactive_since = COALESCE(c.inactive_since, (COALESCE(c.last_activity_at, c.created_at, now())::DATE + INTERVAL '30 days')::DATE),
      inactivity_warning_sent = TRUE
  WHERE c.blocked_at IS NULL
    AND COALESCE(c.inactivity_grace_until, CURRENT_DATE - 1) < CURRENT_DATE
    AND COALESCE(c.last_activity_at, c.created_at, now()) < now() - INTERVAL '30 days'
    AND c.inactive_since IS NULL;
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  UPDATE public.profiles p
  SET status = 'inactive'
  FROM public.coaches c
  WHERE c.profile_id = p.id
    AND c.blocked_at IS NULL
    AND p.status = 'active'
    AND c.inactive_since IS NOT NULL
    AND COALESCE(c.last_activity_at, c.created_at, now()) < now() - INTERVAL '30 days'
    AND COALESCE(c.last_activity_at, c.created_at, now()) >= now() - INTERVAL '60 days'
    AND COALESCE(c.inactivity_grace_until, CURRENT_DATE - 1) < CURRENT_DATE;

  UPDATE public.coaches c
  SET blocked_at = now(),
      blocked_reason = COALESCE(c.blocked_reason, 'Bloqueio automático por 60 dias sem atividade')
  WHERE c.blocked_at IS NULL
    AND COALESCE(c.inactivity_grace_until, CURRENT_DATE - 1) < CURRENT_DATE
    AND COALESCE(c.last_activity_at, c.created_at, now()) < now() - INTERVAL '60 days';

  UPDATE public.profiles p
  SET status = 'blocked'
  FROM public.coaches c
  WHERE c.profile_id = p.id
    AND c.blocked_at IS NOT NULL
    AND p.status IS DISTINCT FROM 'blocked';

  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  SELECT c.profile_id, 'coach_inactivity', 'Atenção: atividade pendente', 'Seu perfil de coach entrou em atenção por falta de atividade recente.', '/coach'
  FROM public.coaches c
  WHERE c.inactivity_warning_sent = TRUE
    AND c.inactive_since = CURRENT_DATE
  ON CONFLICT DO NOTHING;

  RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.extend_coach_inactivity_grace(_coach_id UUID, _days INTEGER DEFAULT 30, _reason TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  coach_profile_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT profile_id INTO coach_profile_id FROM public.coaches WHERE id = _coach_id;
  IF coach_profile_id IS NULL THEN
    RAISE EXCEPTION 'Coach não encontrado';
  END IF;

  UPDATE public.coaches
  SET inactivity_grace_until = CURRENT_DATE + make_interval(days => GREATEST(1, COALESCE(_days, 30))),
      blocked_at = NULL,
      blocked_reason = NULL
  WHERE id = _coach_id;

  UPDATE public.profiles SET status = 'active' WHERE id = coach_profile_id;

  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  VALUES (coach_profile_id, 'coach_grace_extended', 'Prazo estendido', COALESCE(_reason, 'Seu prazo de atividade foi estendido por mais 30 dias.'), '/coach');
END;
$$;

CREATE OR REPLACE FUNCTION public.block_inactive_coach(_coach_id UUID, _reason TEXT DEFAULT 'Bloqueado manualmente por inatividade')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  coach_profile_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT profile_id INTO coach_profile_id FROM public.coaches WHERE id = _coach_id;
  IF coach_profile_id IS NULL THEN
    RAISE EXCEPTION 'Coach não encontrado';
  END IF;

  UPDATE public.coaches
  SET inactive_since = COALESCE(inactive_since, CURRENT_DATE),
      blocked_at = now(),
      blocked_reason = _reason
  WHERE id = _coach_id;

  UPDATE public.profiles SET status = 'blocked' WHERE id = coach_profile_id;

  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  VALUES (coach_profile_id, 'coach_blocked', 'Conta de coach bloqueada', _reason, '/coach');
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_inactive_coach_network(_from_coach_id UUID, _to_coach_id UUID, _reason TEXT DEFAULT 'Remanejamento por inatividade')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_profile_id UUID;
  from_profile_id UUID;
  to_profile_id UUID;
  students_count INTEGER := 0;
  coaches_count INTEGER := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF _from_coach_id = _to_coach_id THEN
    RAISE EXCEPTION 'Selecione coaches diferentes';
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT profile_id INTO from_profile_id FROM public.coaches WHERE id = _from_coach_id;
  SELECT profile_id INTO to_profile_id FROM public.coaches WHERE id = _to_coach_id AND approved_at IS NOT NULL AND blocked_at IS NULL;

  IF from_profile_id IS NULL OR to_profile_id IS NULL THEN
    RAISE EXCEPTION 'Coach de origem ou destino inválido';
  END IF;

  UPDATE public.students SET coach_id = _to_coach_id WHERE coach_id = _from_coach_id;
  GET DIAGNOSTICS students_count = ROW_COUNT;

  UPDATE public.coaches SET upline_coach_id = _to_coach_id WHERE upline_coach_id = _from_coach_id;
  GET DIAGNOSTICS coaches_count = ROW_COUNT;

  UPDATE public.coaches
  SET transferred_to_coach_id = _to_coach_id,
      transferred_at = now(),
      inactive_since = COALESCE(inactive_since, CURRENT_DATE)
  WHERE id = _from_coach_id;

  INSERT INTO public.coach_transfers (from_coach_id, to_coach_id, reason, students_transferred, coaches_transferred, performed_by)
  VALUES (_from_coach_id, _to_coach_id, _reason, students_count, coaches_count, admin_profile_id);

  INSERT INTO public.notifications (profile_id, type, title, message, action_url)
  VALUES
    (from_profile_id, 'network_transferred', 'Rede remanejada', 'Sua rede foi remanejada por inatividade.', '/coach'),
    (to_profile_id, 'network_received', 'Nova rede recebida', 'Você recebeu alunos/coaches por remanejamento administrativo.', '/coach');

  RETURN jsonb_build_object('students_transferred', students_count, 'coaches_transferred', coaches_count);
END;
$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('refresh-coach-inactivity-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-coach-inactivity-daily');

SELECT cron.schedule(
  'refresh-coach-inactivity-daily',
  '0 3 * * *',
  $$
  UPDATE public.coaches c
  SET inactive_since = COALESCE(c.inactive_since, (COALESCE(c.last_activity_at, c.created_at, now())::DATE + INTERVAL '30 days')::DATE),
      inactivity_warning_sent = TRUE
  WHERE c.blocked_at IS NULL
    AND COALESCE(c.inactivity_grace_until, CURRENT_DATE - 1) < CURRENT_DATE
    AND COALESCE(c.last_activity_at, c.created_at, now()) < now() - INTERVAL '30 days'
    AND c.inactive_since IS NULL;

  UPDATE public.profiles p
  SET status = 'inactive'
  FROM public.coaches c
  WHERE c.profile_id = p.id
    AND c.blocked_at IS NULL
    AND p.status = 'active'
    AND c.inactive_since IS NOT NULL
    AND COALESCE(c.last_activity_at, c.created_at, now()) < now() - INTERVAL '30 days'
    AND COALESCE(c.last_activity_at, c.created_at, now()) >= now() - INTERVAL '60 days'
    AND COALESCE(c.inactivity_grace_until, CURRENT_DATE - 1) < CURRENT_DATE;

  UPDATE public.coaches c
  SET blocked_at = now(),
      blocked_reason = COALESCE(c.blocked_reason, 'Bloqueio automático por 60 dias sem atividade')
  WHERE c.blocked_at IS NULL
    AND COALESCE(c.inactivity_grace_until, CURRENT_DATE - 1) < CURRENT_DATE
    AND COALESCE(c.last_activity_at, c.created_at, now()) < now() - INTERVAL '60 days';

  UPDATE public.profiles p
  SET status = 'blocked'
  FROM public.coaches c
  WHERE c.profile_id = p.id
    AND c.blocked_at IS NOT NULL
    AND p.status IS DISTINCT FROM 'blocked';
  $$
);