
-- ============================================================
-- FASE 4 — Guarda unificada de saque (can_withdraw)
-- ============================================================

-- 1. Flags de bloqueio no perfil (fiscal/cadastral/admin)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS withdrawal_blocked boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS withdrawal_block_reason text;

-- 2. Função pública de verificação (usável por app + trigger)
CREATE OR REPLACE FUNCTION public.can_withdraw(_profile_id uuid)
RETURNS TABLE(allowed boolean, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _blocked boolean;
  _reason text;
  _has_return boolean;
BEGIN
  IF _profile_id IS NULL THEN
    RETURN QUERY SELECT false, 'perfil inválido'::text; RETURN;
  END IF;

  SELECT p.withdrawal_blocked, p.withdrawal_block_reason
    INTO _blocked, _reason
  FROM public.profiles p WHERE p.id = _profile_id;

  IF COALESCE(_blocked, false) THEN
    RETURN QUERY SELECT false, COALESCE(_reason, 'pendência cadastral ou fiscal')::text; RETURN;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.return_requests rr
    WHERE rr.requested_by = _profile_id
      AND rr.blocks_settlement = true
      AND rr.status IN ('requested','under_review','approved')
  ) INTO _has_return;

  IF _has_return THEN
    RETURN QUERY SELECT false, 'existe solicitação de devolução em aberto vinculada a este perfil'::text; RETURN;
  END IF;

  RETURN QUERY SELECT true, NULL::text;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_withdraw(uuid) TO authenticated, service_role;

-- 3. Trigger BEFORE INSERT/UPDATE nos pedidos de saque
CREATE OR REPLACE FUNCTION public.guard_withdrawal_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _pid uuid;
  _res record;
BEGIN
  -- Só bloqueia criação ou reabertura; admin pode reprovar/pagar sem restrição
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.status NOT IN ('requested','pending','processing','approved') THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'student_withdrawal_requests' THEN
    SELECT s.profile_id INTO _pid FROM public.students s WHERE s.id = NEW.student_id;
  ELSE
    _pid := NEW.profile_id;
  END IF;

  IF _pid IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO _res FROM public.can_withdraw(_pid);
  IF NOT _res.allowed THEN
    RAISE EXCEPTION 'Saque bloqueado: %', _res.reason USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_withdrawal_request ON public.withdrawal_requests;
CREATE TRIGGER trg_guard_withdrawal_request
  BEFORE INSERT OR UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_request();

DROP TRIGGER IF EXISTS trg_guard_student_withdrawal_request ON public.student_withdrawal_requests;
CREATE TRIGGER trg_guard_student_withdrawal_request
  BEFORE INSERT OR UPDATE ON public.student_withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_withdrawal_request();
