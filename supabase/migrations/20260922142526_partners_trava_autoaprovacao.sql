-- ============================================================================
-- Qualquer usuario logado se aprovava como empresa parceira.
--
-- A policy partners_owner_insert so confere profile_id, o papel authenticated
-- tem INSERT e UPDATE em status e approved_at, e nenhum gatilho barrava:
-- partners_ensure_approved_at ate preenchia a data. Com o proprio JWT, um
-- POST em /rest/v1/partners com status 'approved' criava a parceria aprovada,
-- a unidade e o coach-espelho aprovado (painel, codigo de indicacao, comissao).
-- E o dono de uma parceria pendente e dono em partner_members desde o INSERT,
-- entao partners_owner_update deixava ele mesmo fazer PATCH status='approved'.
--
-- Este gatilho so vale para usuario logado que nao e admin. Ficam livres:
--   - service role (auth.uid() nulo): cadastro em registration.server.ts e as
--     aprovacoes de partner-approvals.functions.ts;
--   - admin: admin.partners.tsx aprova pelo cliente autenticado.
-- Por isso nao ha revoke de coluna: um revoke em partners derrubou o login de
-- todos os parceiros em 22/08/2026.
--
-- O nome comeca com "a_" para rodar antes de todo gatilho BEFORE de partners
-- (a ordem e alfabetica), em especial antes de partners_ensure_approved_at_trg,
-- e para comparar exatamente o que o usuario mandou.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.partners_trava_autoaprovacao()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.approved_at := NULL;
    NEW.blocked_at := NULL;
    NEW.activation_paid_at := NULL;
    NEW.activation_source := NULL;
    NEW.documents_reviewed_at := NULL;
    NEW.documents_reviewed_by := NULL;
    -- trg_partners_referral_code gera o codigo quando vem nulo.
    NEW.referral_code := NULL;
    NEW.referral_link := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.blocked_at IS DISTINCT FROM OLD.blocked_at
     OR NEW.activation_paid_at IS DISTINCT FROM OLD.activation_paid_at
     OR NEW.activation_source IS DISTINCT FROM OLD.activation_source
     OR NEW.documents_reviewed_at IS DISTINCT FROM OLD.documents_reviewed_at
     OR NEW.documents_reviewed_by IS DISTINCT FROM OLD.documents_reviewed_by
     OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'Somente o admin altera status, aprovacao, ativacao, dono ou codigo da parceria.'
      USING ERRCODE = '42501';
  END IF;

  -- Vindo de outro gatilho, e o sistema: sync_profile_upline_from_student_coach
  -- copia para partners o coach do aluno quando ele muda.
  IF NEW.upline_coach_id IS DISTINCT FROM OLD.upline_coach_id AND pg_trigger_depth() = 1 THEN
    RAISE EXCEPTION 'Somente o admin altera o upline da parceria.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_partners_trava_autoaprovacao_trg ON public.partners;
CREATE TRIGGER a_partners_trava_autoaprovacao_trg
BEFORE INSERT OR UPDATE ON public.partners
FOR EACH ROW
EXECUTE FUNCTION public.partners_trava_autoaprovacao();
