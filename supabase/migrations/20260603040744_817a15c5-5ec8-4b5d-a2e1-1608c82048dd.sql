
-- 1) Reativar perfis inativados pelo cron (não bloqueados) e resetar inatividade dos coaches
UPDATE public.coaches
SET inactive_since = NULL,
    inactivity_grace_until = NULL,
    inactivity_warning_sent = FALSE,
    last_activity_at = now()
WHERE blocked_at IS NULL;

UPDATE public.profiles
SET status = 'active'
WHERE status = 'inactive';

-- 2) RPC para o app chamar no login: marca atividade
CREATE OR REPLACE FUNCTION public.touch_my_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
BEGIN
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF v_profile_id IS NULL THEN RETURN; END IF;

  UPDATE public.coaches
  SET last_activity_at = now(),
      inactive_since = NULL,
      inactivity_grace_until = NULL,
      inactivity_warning_sent = FALSE
  WHERE profile_id = v_profile_id;

  -- Reativa perfil caso esteja inativo (não mexe em bloqueados)
  UPDATE public.profiles
  SET status = 'active'
  WHERE id = v_profile_id AND status = 'inactive';
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_my_activity() TO authenticated;

-- 3) Atualizar cron para nunca inativar admins/students e considerar grace maior
SELECT cron.unschedule('refresh-coach-inactivity-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-coach-inactivity-daily');

SELECT cron.schedule(
  'refresh-coach-inactivity-daily',
  '0 3 * * *',
  $$
  UPDATE public.coaches c
  SET inactive_since = COALESCE(c.inactive_since, (COALESCE(c.last_activity_at, c.created_at, now())::DATE + INTERVAL '60 days')::DATE),
      inactivity_warning_sent = TRUE
  FROM public.profiles p
  WHERE p.id = c.profile_id
    AND p.role = 'coach'
    AND c.blocked_at IS NULL
    AND COALESCE(c.inactivity_grace_until, CURRENT_DATE - 1) < CURRENT_DATE
    AND COALESCE(c.last_activity_at, c.created_at, now()) < now() - INTERVAL '60 days'
    AND c.inactive_since IS NULL;

  UPDATE public.profiles p
  SET status = 'inactive'
  FROM public.coaches c
  WHERE c.profile_id = p.id
    AND p.role = 'coach'
    AND c.blocked_at IS NULL
    AND p.status = 'active'
    AND c.inactive_since IS NOT NULL
    AND COALESCE(c.last_activity_at, c.created_at, now()) < now() - INTERVAL '60 days'
    AND COALESCE(c.last_activity_at, c.created_at, now()) >= now() - INTERVAL '90 days'
    AND COALESCE(c.inactivity_grace_until, CURRENT_DATE - 1) < CURRENT_DATE;

  UPDATE public.coaches c
  SET blocked_at = now(),
      blocked_reason = COALESCE(c.blocked_reason, 'Bloqueio automático por 90 dias sem atividade')
  FROM public.profiles p
  WHERE p.id = c.profile_id
    AND p.role = 'coach'
    AND c.blocked_at IS NULL
    AND COALESCE(c.inactivity_grace_until, CURRENT_DATE - 1) < CURRENT_DATE
    AND COALESCE(c.last_activity_at, c.created_at, now()) < now() - INTERVAL '90 days';

  UPDATE public.profiles p
  SET status = 'blocked'
  FROM public.coaches c
  WHERE c.profile_id = p.id
    AND p.role = 'coach'
    AND c.blocked_at IS NOT NULL
    AND p.status IS DISTINCT FROM 'blocked';
  $$
);
