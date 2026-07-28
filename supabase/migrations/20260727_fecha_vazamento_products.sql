-- =====================================================================
-- FitMind Club — Fecha vazamento de custo/margem/comissao em products
-- APLICADO EM PRODUCAO em 27/07/2026, verificado empiricamente.
--
-- PROBLEMA: a policy products_read_all (migration 20260414171318) foi
-- criada como FOR SELECT USING (true) SEM clausula TO. No Postgres isso
-- vale para PUBLIC, que inclui anon. Somado ao grant padrao do Supabase,
-- qualquer visitante lia 81 produtos com:
--   cost, other_costs, commission_coach, commission_level1..5,
--   app_fee, card_fee_percentage, tax_percentage
--
-- ESTRATEGIA: a vitrine publica passa a vir de uma RPC SECURITY DEFINER
-- que le products por dentro e devolve apenas colunas de vitrine.
-- Nenhuma coluna de custo, comissao, taxa ou imposto existe no RETURNS.
--
-- VERIFICADO DEPOIS DE APLICAR (SET LOCAL ROLE anon):
--   SELECT count(cost) FROM products;        -> permission denied  OK
--   SELECT count(*) FROM catalogo_publico(); -> 78 itens           OK
--
-- REVERSAO:
--   GRANT SELECT ON public.products TO anon;
--   DROP POLICY products_read_authenticated ON public.products;
--   CREATE POLICY products_read_all ON public.products
--     FOR SELECT USING (true);
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.catalogo_publico()
RETURNS TABLE (
  id uuid, nome text, subtitulo text, descricao text,
  preco numeric, preco_original numeric,
  imagem_url text, imagens text[],
  secao_id uuid, categoria_id uuid, subcategoria_id uuid,
  badge text, coach_id uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.name, p.subtitle, p.description,
         p.price, p.original_price, p.image_url, p.image_urls,
         NULL::uuid, NULL::uuid, NULL::uuid,
         p.badge_label, p.creator_coach_id
    FROM public.products p
   WHERE p.status = 'active' AND p.kind IS NULL
  UNION ALL
  SELECT p.id, p.name, p.short_description, p.description,
         p.price, p.original_price, p.image_url, p.image_urls,
         p.section_id, p.category_id, p.subcategory_id,
         NULL::text, p.creator_coach_id
    FROM public.products p
   WHERE p.kind IS NOT NULL AND p.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.catalogo_publico() FROM public;
GRANT EXECUTE ON FUNCTION public.catalogo_publico() TO anon, authenticated;

DROP POLICY IF EXISTS products_read_all ON public.products;

CREATE POLICY products_read_authenticated ON public.products
  FOR SELECT TO authenticated USING (true);

REVOKE SELECT ON public.products FROM anon;

COMMIT;

-- =====================================================================
-- PENDENCIAS ABERTAS — nao resolvidas por esta migration
-- =====================================================================
-- 1. src/routes/r.$code.tsx:88 le products direto e roda SEM login
--    (link de indicacao do coach). Vai parar de resolver o produto para
--    visitante deslogado. Precisa passar pela RPC.
--
-- 2. src/components/student/StorePage.tsx:172 busca cost, other_costs,
--    commission_coach, commission_level1..3, app_fee,
--    card_fee_percentage e tax_percentage para o navegador do aluno.
--    Como a policy nova e USING (true) para authenticated, a margem
--    segue legivel por qualquer conta gratuita. O dado saiu da internet
--    aberta mas nao saiu da mao dos 107 cadastrados.
--
-- 3. products_admin_all continua com roles = {public}. Se o USING dela
--    consultar profiles, pode envenenar leitura anonima com erro, como
--    ocorreu em professional_products. Auditar.
-- =====================================================================
