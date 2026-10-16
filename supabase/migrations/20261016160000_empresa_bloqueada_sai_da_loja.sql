-- Bloquear uma empresa parceira pelo painel nao tirava nada da loja.
--
-- Caso: Segredos da Strella, bloqueada em outubro de 2026 (`partners.status =
-- 'blocked'`), com os 19 produtos (18 pagos e 1 gratuito) continuando na
-- vitrine e a venda.
--
-- Dois buracos:
--
-- 1. A leitura publica de `partner_products`
--    (`partner_products_public_select_approved`) liberava todo produto
--    `approved`, sem olhar a empresa. A loja tambem nao tem como olhar: a
--    tabela `partners` e fechada para leitura direta desde a correcao de
--    seguranca, e o catalogo (`src/lib/unified-store.ts`) le so o produto.
-- 2. `create_partner_product_order` confere o produto, nao a empresa: quem
--    tivesse o link comprava de empresa bloqueada.
--
-- A regra mora em `parceiro_vende(empresa)`: aprovada e sem `blocked_at`.
-- Ela entra na leitura publica e num gatilho de INSERT em
-- `partner_product_orders`. Desbloquear a empresa devolve tudo sozinho - nao
-- ha produto para reativar um por um, e as escolhas do parceiro
-- (`is_active_by_partner`) ficam intactas.
--
-- A funcao e SECURITY DEFINER de proposito: a policy roda com o papel de quem
-- pergunta, e o aluno nao le `partners` - um EXISTS direto na policy daria
-- falso para todo mundo e apagaria a vitrine inteira.
--
-- Medido antes de aplicar: a Segredos da Strella e a unica empresa nao
-- aprovada (ou com blocked_at) que tinha produto na vitrine. Nada mais some.
--
-- Fica como estava: dono da unidade (`current_partner_id()`) e admin continuam
-- lendo os produtos da empresa bloqueada; cupom gratuito ja era barrado por
-- `student_generate_partner_coupon` (pa.status = 'approved').

BEGIN;

CREATE OR REPLACE FUNCTION public.parceiro_vende(_partner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.partners pa
     WHERE pa.id = _partner_id
       AND pa.status = 'approved'
       AND pa.blocked_at IS NULL
  );
$function$;

COMMENT ON FUNCTION public.parceiro_vende(uuid) IS
  'A empresa parceira pode aparecer na loja e vender: aprovada e sem bloqueio. Usada na leitura publica de partner_products e no gatilho que barra pedido novo.';

REVOKE ALL ON FUNCTION public.parceiro_vende(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.parceiro_vende(uuid) TO anon, authenticated, service_role;

-- Leitura publica: os mesmos tres caminhos de antes; o primeiro agora tambem
-- exige a empresa vendendo.
DROP POLICY IF EXISTS partner_products_public_select_approved ON public.partner_products;
CREATE POLICY partner_products_public_select_approved
  ON public.partner_products
  FOR SELECT
  TO public
  USING (
    ((status)::text = 'approved'::text AND public.parceiro_vende(partner_id))
    OR (SELECT public.is_admin(auth.uid()) AS is_admin)
    OR (partner_id = (SELECT public.current_partner_id() AS current_partner_id))
  );

-- Pedido novo de empresa que nao vende: barrado em qualquer caminho de criacao.
-- Admin passa (venda manual, correcao).
CREATE OR REPLACE FUNCTION public.parceiro_bloqueado_nao_vende()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.partner_id IS NOT NULL
     AND NOT public.parceiro_vende(NEW.partner_id)
     AND NOT COALESCE(public.is_admin(auth.uid()), false) THEN
    RAISE EXCEPTION 'Esta empresa está temporariamente indisponível na loja.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_parceiro_bloqueado_nao_vende ON public.partner_product_orders;
CREATE TRIGGER trg_parceiro_bloqueado_nao_vende
  BEFORE INSERT ON public.partner_product_orders
  FOR EACH ROW EXECUTE FUNCTION public.parceiro_bloqueado_nao_vende();

COMMIT;
