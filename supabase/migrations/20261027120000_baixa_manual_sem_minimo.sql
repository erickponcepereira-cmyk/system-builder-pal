-- A baixa manual do admin deixa de esbarrar no saque mínimo de R$ 50.
--
-- 27/10/2026: o Erick adiantou um valor por fora para a Ana Flávia Lucas e não
-- conseguiu dar baixa dele em Pagamentos ("Lançar baixa"), porque era menos de
-- R$ 50. Quem barrava era o gatilho `guard_withdrawal_request`, que vale para
-- toda linha de `withdrawal_requests` e `student_withdrawal_requests` — inclusive
-- a que `registerManualPayout` grava já aprovada.
--
-- O mínimo é regra do pedido de saque da pessoa, e continua valendo para ela:
-- `request_seller_withdrawal_atomic` (coach, parceiro, profissional) e
-- `requestStudentWithdrawal` (aluno) conferem os R$ 50 por conta própria, e o
-- pedido da pessoa sempre nasce `requested`. A baixa do admin é reconhecida por
-- ser feita com a sessão de um admin, ou pelo servidor (chave de serviço) numa
-- linha já `approved`/`paid`. O resto do gatilho — bloqueio de saque, devolução
-- em aberto, um pedido aberto por vez — não muda.

CREATE OR REPLACE FUNCTION public.guard_withdrawal_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _pid uuid;
  _student_id uuid;
  _res record;
  _baixa_do_admin boolean;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status AND NEW.amount = OLD.amount THEN
    RETURN NEW;
  END IF;

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Valor de saque inválido' USING ERRCODE = 'check_violation';
  END IF;

  -- O mínimo vale para o pedido da pessoa, não para a baixa manual do admin.
  _baixa_do_admin := COALESCE(public.is_admin(auth.uid()), false)
    OR (auth.uid() IS NULL AND NEW.status IN ('approved', 'paid'));

  IF NEW.amount < 50 AND NOT _baixa_do_admin THEN
    RAISE EXCEPTION 'Saque mínimo: R$ 50,00' USING ERRCODE = 'check_violation';
  END IF;

  IF TG_TABLE_NAME = 'student_withdrawal_requests' THEN
    _student_id := NEW.student_id;
    SELECT s.profile_id INTO _pid FROM public.students s WHERE s.id = NEW.student_id;
  ELSE
    _pid := NEW.profile_id;
    SELECT s.id INTO _student_id FROM public.students s WHERE s.profile_id = NEW.profile_id LIMIT 1;
  END IF;

  IF NEW.status IN ('requested','processing','approved') THEN
    IF _pid IS NULL THEN
      RAISE EXCEPTION 'Perfil não encontrado para solicitação de saque' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO _res FROM public.can_withdraw(_pid);
    IF NOT _res.allowed THEN
      RAISE EXCEPTION 'Saque bloqueado: %', _res.reason USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'withdrawal_requests' THEN
      IF EXISTS (
        SELECT 1 FROM public.withdrawal_requests wr
        WHERE wr.profile_id = _pid
          AND wr.status IN ('requested','processing','approved')
          AND wr.id <> NEW.id
      ) THEN
        RAISE EXCEPTION 'Já existe uma solicitação de saque pendente para este perfil. Cancele antes de refazer.' USING ERRCODE = 'unique_violation';
      END IF;
      IF _student_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.student_withdrawal_requests swr
        WHERE swr.student_id = _student_id
          AND swr.status IN ('requested','processing','approved')
      ) THEN
        RAISE EXCEPTION 'Já existe uma solicitação de saque pendente para este perfil. Cancele antes de refazer.' USING ERRCODE = 'unique_violation';
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1 FROM public.student_withdrawal_requests swr
        WHERE swr.student_id = _student_id
          AND swr.status IN ('requested','processing','approved')
          AND swr.id <> NEW.id
      ) THEN
        RAISE EXCEPTION 'Já existe uma solicitação de saque pendente para este perfil. Cancele antes de refazer.' USING ERRCODE = 'unique_violation';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.withdrawal_requests wr
        WHERE wr.profile_id = _pid
          AND wr.status IN ('requested','processing','approved')
      ) THEN
        RAISE EXCEPTION 'Já existe uma solicitação de saque pendente para este perfil. Cancele antes de refazer.' USING ERRCODE = 'unique_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
