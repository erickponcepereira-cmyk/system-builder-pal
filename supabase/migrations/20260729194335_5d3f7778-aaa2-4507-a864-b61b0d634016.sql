-- 1) Coluna canônica
ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS is_network boolean NOT NULL DEFAULT false;

-- 2) Vendedor da venda (perfil), resolvido pela estrutura da origem
CREATE OR REPLACE FUNCTION public.commission_seller_profile_id(_transaction_id uuid, _partner_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile uuid;
BEGIN
  IF _partner_order_id IS NOT NULL THEN
    SELECT c.profile_id INTO v_profile
    FROM public.partner_product_orders po
    JOIN public.coaches c ON c.id = po.selling_coach_id
    WHERE po.id = _partner_order_id;
    IF v_profile IS NOT NULL THEN RETURN v_profile; END IF;
  END IF;

  SELECT k.beneficiary_profile_id INTO v_profile
  FROM public.commissions k
  WHERE k.slot_label ILIKE 'Comiss%Vendedor%'
    AND (
      (_transaction_id IS NOT NULL AND k.transaction_id = _transaction_id)
      OR (_partner_order_id IS NOT NULL AND k.partner_order_id = _partner_order_id)
    )
  LIMIT 1;

  RETURN v_profile;
END;
$$;

-- 3) Classificação + normalização do rótulo de retorno
CREATE OR REPLACE FUNCTION public.commissions_classify_network()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_label text := COALESCE(NEW.slot_label, '');
  v_is_line boolean;
  v_seller uuid;
  v_n text;
BEGIN
  v_is_line := COALESCE(NEW.level, 0) > 0
    OR v_label ~* '(^|\s)(linha|upline)\s*[0-9]+'
    OR v_label ~* 'sem\s+upline';

  IF NOT v_is_line THEN
    NEW.is_network := false;
    RETURN NEW;
  END IF;

  v_seller := public.commission_seller_profile_id(NEW.transaction_id, NEW.partner_order_id);

  IF v_seller IS NOT NULL AND v_seller = NEW.beneficiary_profile_id THEN
    -- Fatia de linha que voltou para o próprio vendedor: comissão DIRETA.
    v_n := COALESCE(NULLIF(substring(v_label from '([0-9]+)'), ''),
                    NULLIF(COALESCE(NEW.level, 0)::text, '0'), '');
    NEW.is_network := false;
    NEW.level := 0;
    NEW.slot_label := CASE WHEN v_n = '' THEN 'Comissão Direta (sem upline)'
                           ELSE 'Comissão Direta (sem upline N' || v_n || ')' END;
  ELSE
    NEW.is_network := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_classify_network ON public.commissions;
CREATE TRIGGER trg_commissions_classify_network
BEFORE INSERT OR UPDATE OF level, slot_label, beneficiary_profile_id, transaction_id, partner_order_id
ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.commissions_classify_network();

-- 4) Quando a linha do VENDEDOR chega depois das fatias, reavalia as irmãs
CREATE OR REPLACE FUNCTION public.commissions_reclassify_siblings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.slot_label, '') NOT ILIKE 'Comiss%Vendedor%' THEN
    RETURN NULL;
  END IF;
  UPDATE public.commissions c
  SET slot_label = c.slot_label
  WHERE c.id <> NEW.id
    AND c.beneficiary_profile_id = NEW.beneficiary_profile_id
    AND c.is_network = true
    AND (
      (NEW.transaction_id IS NOT NULL AND c.transaction_id = NEW.transaction_id)
      OR (NEW.partner_order_id IS NOT NULL AND c.partner_order_id = NEW.partner_order_id)
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_reclassify_siblings ON public.commissions;
CREATE TRIGGER trg_commissions_reclassify_siblings
AFTER INSERT ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.commissions_reclassify_siblings();

-- 5) Backfill: marca is_network de tudo e normaliza as fatias de retorno
UPDATE public.commissions c
SET is_network = (
  (COALESCE(c.level, 0) > 0 OR COALESCE(c.slot_label, '') ~* '(^|\s)(linha|upline)\s*[0-9]+')
  AND COALESCE(c.slot_label, '') !~* 'sem\s+upline'
  AND COALESCE(public.commission_seller_profile_id(c.transaction_id, c.partner_order_id), '00000000-0000-0000-0000-000000000000'::uuid)
      IS DISTINCT FROM c.beneficiary_profile_id
);

WITH alvo AS (
  SELECT c.id,
         COALESCE(NULLIF(substring(COALESCE(c.slot_label, '') from '([0-9]+)'), ''),
                  NULLIF(COALESCE(c.level, 0)::text, '0'), '') AS n,
         c.beneficiary_profile_id
  FROM public.commissions c
  WHERE COALESCE(c.slot_label, '') ~* '(^|\s)(linha|upline)\s*[0-9]+'
    AND public.commission_seller_profile_id(c.transaction_id, c.partner_order_id) = c.beneficiary_profile_id
)
UPDATE public.commissions c
SET level = 0,
    is_network = false,
    slot_label = CASE WHEN a.n = '' THEN 'Comissão Direta (sem upline)'
                      ELSE 'Comissão Direta (sem upline N' || a.n || ')' END
FROM alvo a
WHERE c.id = a.id;

-- 6) Recalcula as carteiras dos afetados
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT beneficiary_profile_id AS pid
    FROM public.commissions
    WHERE slot_label ILIKE 'Comissão Direta (sem upline%'
  LOOP
    BEGIN
      PERFORM public.recalc_wallets_for_owner(r.pid);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;