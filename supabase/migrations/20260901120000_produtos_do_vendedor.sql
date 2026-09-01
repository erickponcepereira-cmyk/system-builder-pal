-- ============================================================================
-- Os produtos de um vendedor, sem trazer o catálogo inteiro.
--
-- A página do vendedor que eu escrevi ontem chamava `loadUnifiedCatalog` — as
-- cinco leituras paginadas, os 1.911 produtos ativos, a resolução de nome de
-- vendedor por RPC — para depois filtrar por `sellerId` no navegador e ficar
-- com uma dúzia. Funciona e é lento à toa, e a lentidão cai justamente sobre
-- quem clicou no vendedor porque estava decidindo se compra.
--
-- Os outros três dados dessa página já vinham por função. Este destoava.
--
-- O `id` sai com o MESMO prefixo do catálogo unificado (`partner_company-` e
-- `partner-`) porque a página usa esse id para abrir o produto na vitrine. Um
-- id cru aqui quebraria o link sem erro nenhum: a loja simplesmente não
-- acharia o produto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.produtos_do_vendedor(_tipo text, _id uuid)
RETURNS TABLE (
  id text,
  source_id uuid,
  titulo text,
  preco numeric,
  preco_original numeric,
  imagem text,
  gratuito boolean,
  secao_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn_prods$
  SELECT ('partner_company-' || pp.id::text)::text,
         pp.id,
         pp.name::text,
         pp.price,
         pp.original_price,
         COALESCE(pp.image_url, (pp.image_urls)[1])::text,
         (pp.kind = 'free'),
         pp.section_id
    FROM public.partner_products pp
   WHERE _tipo = 'partner'
     AND pp.partner_id = _id
     AND pp.status = 'approved'
     AND pp.is_active_by_partner
     AND pp.is_ready_for_sale
     AND pp.deleted_at IS NULL

  UNION ALL

  SELECT ('partner-' || fp.id::text)::text,
         fp.id,
         fp.name::text,
         fp.price,
         fp.original_price,
         COALESCE(fp.image_url, (fp.image_urls)[1])::text,
         (fp.kind = 'free'),
         fp.section_id
    FROM public.professional_products fp
   WHERE _tipo = 'professional'
     AND fp.coach_id = _id
     AND fp.status = 'approved'
     AND fp.is_active_by_professional
     AND fp.is_ready_for_sale

  ORDER BY 7 DESC, 3;
$fn_prods$;

GRANT EXECUTE ON FUNCTION public.produtos_do_vendedor(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.produtos_do_vendedor(text, uuid) IS
  'Produtos a venda de um vendedor. O id sai com o prefixo do catalogo unificado porque a pagina usa ele para abrir o produto na vitrine; id cru quebraria o link sem erro. Gratuitos primeiro — sao a isca.';
