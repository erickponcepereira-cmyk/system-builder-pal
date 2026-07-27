-- ==========================================================================
-- PROPOSTA — NAO APLICADA. Escrita pelo chat de funcionalidades.
-- Este arquivo esta FORA de supabase/migrations/ de proposito.
-- Quem aplica e dono da migration: chat financeiro.
-- ==========================================================================
--
-- EVIDENCIA (colhida em 26/07/2026 contra o projeto real, via REST API,
-- usando apenas a publishable key que ja vai no bundle do navegador):
--
--   products   -> anon leu  81 linhas, com cost, other_costs,
--                 commission_coach, commission_level1, tax_percentage, app_fee
--   profiles   -> anon leu  51 linhas, com name e email
--   coaches    -> anon leu  51 linhas
--
-- DUAS CAUSAS RAIZ DISTINTAS:
--
-- (A) Policies escritas sem clausula TO. No Postgres, policy sem TO vale
--     para o papel PUBLIC, que inclui anon. Atingidas:
--       products_read_all            (20260414) FOR SELECT USING (true)
--       benefits_read_all            (20260414) FOR SELECT USING (true)
--       freebies_read_all            (20260507)
--       profiles_public_basic_select (20260716) recriada SEM o TO que tinha
--
-- (B) Migration 20260718204034 trocou grants por-coluna por grants de tabela
--     inteira. Especificamente "GRANT SELECT ON public.profiles TO anon",
--     que anulou na pratica a protecao por coluna feita em 20260602/20260622
--     e foi o que expos profiles.email.
--
-- NAO existe grant em massa (ALL TABLES IN SCHEMA). O raio e limitado
-- as 20 tabelas listadas em 20260718204034 mais as da causa (A).
--
-- ORDEM SUGERIDA: Parte 1 primeiro, e a que vaza dado pessoal.
-- ==========================================================================


-- --------------------------------------------------------------------------
-- PARTE 1 — profiles: fechar o vazamento de email (LGPD, 51 titulares)
-- --------------------------------------------------------------------------
-- Restaura o modelo por coluna que existia antes de 20260718.

REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (id, name, avatar_url, role, city, state, created_at)
  ON public.profiles TO anon;

DROP POLICY IF EXISTS profiles_public_basic_select ON public.profiles;
CREATE POLICY profiles_public_basic_select ON public.profiles
  FOR SELECT TO anon, authenticated
  USING (public.profile_has_approved_coach(id));


-- --------------------------------------------------------------------------
-- PARTE 2 — products: fechar custo, margem e comissoes
-- --------------------------------------------------------------------------
-- products NAO esta em 20260718204034. O acesso vem do default privilege
-- padrao do Supabase somado a policy sem TO. Fechar a policy resolve.

DROP POLICY IF EXISTS products_read_all ON public.products;
CREATE POLICY products_read_authenticated ON public.products
  FOR SELECT TO authenticated
  USING (true);

REVOKE SELECT ON public.products FROM anon;


-- --------------------------------------------------------------------------
-- PARTE 3 — partner_benefits: esconder o cupom, manter a vitrine
-- --------------------------------------------------------------------------
-- CORRIGIDO EM 27/07. A versao anterior fechava a tabela inteira para anon,
-- o que quebraria a faixa de beneficios da loja publica.
--
-- O que precisa ficar invisivel e SO o coupon_code — o cupom E o beneficio,
-- e usa-lo exige carteirinha ativa. Nome, descricao e desconto sao vitrine:
-- e justamente isso que faz a pessoa querer ativar. Entao a protecao correta
-- e grant por coluna, o mesmo modelo que voce aplicou em profiles.

REVOKE SELECT ON public.partner_benefits FROM anon;

GRANT SELECT (id, name, description, category, discount_info,
              website_url, logo_url, is_active, sort_order)
  ON public.partner_benefits TO anon;

DROP POLICY IF EXISTS benefits_read_all ON public.partner_benefits;
CREATE POLICY benefits_read_showcase ON public.partner_benefits
  FOR SELECT TO anon, authenticated
  USING (is_active = true);


-- --------------------------------------------------------------------------
-- PARTE 4 — freebies: manter publico DE PROPOSITO
-- --------------------------------------------------------------------------
-- A aba de gratuitos publica depende disto. As colunas de freebies sao
-- material de vitrine (nome, imagem, patrocinador, local, valor estimado).
-- Nao ha custo nem margem. Fica aberto, mas agora declarado.

DROP POLICY IF EXISTS freebies_read_all ON public.freebies;
CREATE POLICY freebies_read_public_showcase ON public.freebies
  FOR SELECT TO anon, authenticated
  USING (is_active = true);

CREATE POLICY freebies_admin_read ON public.freebies
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

-- O RESGATE continua fechado: freebie_redemptions nao recebe nada aqui.


-- --------------------------------------------------------------------------
-- PARTE 5 — a RPC que a loja publica vai consumir
-- --------------------------------------------------------------------------
-- Depois da Parte 2, o anon perde products. A vitrine passa a vir daqui.
-- SECURITY DEFINER: le products por dentro, devolve so coluna de vitrine.
-- Nenhuma coluna de custo, comissao, taxa ou imposto aparece no RETURNS.
--
-- CONFIRMAR ANTES DE APLICAR: products tem duas formas vivas no codigo —
-- linhas legadas filtradas por status='active', e linhas novas filtradas
-- por kind IS NOT NULL AND is_active=true. O UNION cobre as duas.
-- Se uma estiver morta, simplificar.

CREATE OR REPLACE FUNCTION public.catalogo_publico()
RETURNS TABLE (
  id              uuid,
  nome            text,
  subtitulo       text,
  descricao       text,
  preco           numeric,
  preco_original  numeric,
  imagem_url      text,
  imagens         text[],
  secao_id        uuid,
  categoria_id    uuid,
  subcategoria_id uuid,
  badge           text,
  coach_id        uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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


-- --------------------------------------------------------------------------
-- VERIFICACAO — rodar DEPOIS de aplicar
-- --------------------------------------------------------------------------
-- 1) Nenhuma policy permissiva sem clausula TO deve sobrar:
--
--    SELECT tablename, policyname, roles, cmd, qual
--      FROM pg_policies
--     WHERE schemaname = 'public' AND 'public' = ANY(roles)
--     ORDER BY tablename;
--
-- 2) O que anon ainda enxerga por coluna:
--
--    SELECT table_name, column_name
--      FROM information_schema.column_privileges
--     WHERE grantee = 'anon' AND table_schema = 'public'
--     ORDER BY table_name, column_name;
--
-- 3) Teste de fora, com a publishable key (deve voltar 401 ou vazio):
--    GET /rest/v1/products?select=id,cost&limit=1
--    GET /rest/v1/profiles?select=id,email&limit=1
--
-- 4) Auditar as outras 16 tabelas de 20260718204034 com o mesmo criterio.
--    Testei products, profiles, coaches, partner_products,
--    professional_products, store_products, students. As demais nao.
-- ==========================================================================
