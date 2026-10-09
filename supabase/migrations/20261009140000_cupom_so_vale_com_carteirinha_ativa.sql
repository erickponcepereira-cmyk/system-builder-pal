-- Continuacao de 20261009120000: la a carteirinha passou a exigir mensalidade
-- em dia, mas os cupons ja emitidos continuavam valendo. Decisao do Erick em
-- 09/10/2026: cancelar os de quem esta bloqueado, e exigir carteirinha ativa
-- tambem na hora de usar.
--
-- A regra confirmada: em dia, vale para dono da unidade e para colaborador;
-- bloqueado, cai para os dois.
--
-- 1. Cancela os cupons `active` - de parceiro e de profissional - de quem esta
--    bloqueado por mensalidade. Retrato do antes em
--    `backup.cupons_cancelados_20261009`.
--
-- 2. Exige carteirinha ativa para marcar cupom como usado. A trava vai como
--    gatilho nas duas tabelas em vez de dentro de `partner_redeem_coupon`
--    porque o cupom de profissional **nao tem funcao de balcao**: ele e
--    marcado como usado por UPDATE direto, pela policy
--    "Professional updates own coupons". No gatilho, a regra vale em qualquer
--    caminho - funcao, policy ou painel.
--
-- Admin passa pela trava: correcao manual de dados continua possivel.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Os cupons de quem esta bloqueado
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS backup;
DROP TABLE IF EXISTS backup.cupons_cancelados_20261009;

CREATE TABLE backup.cupons_cancelados_20261009 AS
SELECT 'partner_coupons'::text AS tabela, to_jsonb(c.*) AS linha
  FROM public.partner_coupons c
  JOIN public.students s ON s.id = c.student_id
  JOIN public.profiles pr ON pr.id = s.profile_id
 WHERE c.status::text = 'active'
   AND public.is_user_blocked_by_subscription(pr.user_id)
UNION ALL
SELECT 'professional_coupons', to_jsonb(c.*)
  FROM public.professional_coupons c
  JOIN public.students s ON s.id = c.student_id
  JOIN public.profiles pr ON pr.id = s.profile_id
 WHERE c.status::text = 'active'
   AND public.is_user_blocked_by_subscription(pr.user_id);

REVOKE ALL ON backup.cupons_cancelados_20261009 FROM PUBLIC, anon, authenticated;

UPDATE public.partner_coupons c
   SET status = 'cancelled'
  FROM backup.cupons_cancelados_20261009 b
 WHERE b.tabela = 'partner_coupons'
   AND c.id = (b.linha->>'id')::uuid;

UPDATE public.professional_coupons c
   SET status = 'cancelled'
  FROM backup.cupons_cancelados_20261009 b
 WHERE b.tabela = 'professional_coupons'
   AND c.id = (b.linha->>'id')::uuid;

-- ---------------------------------------------------------------------------
-- 2) Usar o cupom tambem exige carteirinha ativa
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_resgate_exige_carteirinha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF COALESCE(OLD.status::text, '') = 'active'
     AND NEW.status::text IN ('used', 'redeemed')
     AND NOT COALESCE(public.is_admin(auth.uid()), false)
     AND NOT public.student_card_ativa(NEW.student_id) THEN
    RAISE EXCEPTION 'A carteirinha deste aluno esta inativa. O cupom so vale com a carteirinha ativa.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.guard_resgate_exige_carteirinha() IS
  'Cupom so pode virar usado com a carteirinha ativa. Vale para cupom de parceiro e de profissional, em qualquer caminho de escrita. Admin passa.';

DROP TRIGGER IF EXISTS trg_partner_coupons_exige_carteirinha ON public.partner_coupons;
CREATE TRIGGER trg_partner_coupons_exige_carteirinha
  BEFORE UPDATE ON public.partner_coupons
  FOR EACH ROW EXECUTE FUNCTION public.guard_resgate_exige_carteirinha();

DROP TRIGGER IF EXISTS trg_professional_coupons_exige_carteirinha ON public.professional_coupons;
CREATE TRIGGER trg_professional_coupons_exige_carteirinha
  BEFORE UPDATE ON public.professional_coupons
  FOR EACH ROW EXECUTE FUNCTION public.guard_resgate_exige_carteirinha();

COMMIT;
