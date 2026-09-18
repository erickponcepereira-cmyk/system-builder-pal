-- ============================================================================
-- A FitMind sumiu para 571 alunos, e ninguem viu quem escondeu.
--
-- A loja nova (24/08) poe no topo da tela do coach um cartao que parece
-- informativo — "Produtos FitMind visiveis para sua rede" — e um toque nele
-- esconde o catalogo FitMind INTEIRO da rede toda, sem pedir confirmacao.
-- Dois toques assim estavam de pe:
--
--   Nathan Utuari  15/09 14:54  topo da rede: 110 coaches e 571 alunos
--   Tatiane        30/08 17:26  4 coaches e 14 alunos, dentro da rede do Nathan
--
-- Os 110 coaches abaixo do Nathan viam "A FitMind esta bloqueada pelo seu
-- upline", e nenhuma tela do admin lista ocultacao de coach — por isso
-- parecia defeito, e nao escolha de alguem.
--
-- A tela ganhou confirmacao no mesmo commit desta migration. Aqui so se
-- desfazem os dois toques, com copia antes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auditoria.ocultacoes_fitmind_20260917 AS
  SELECT h.*, now() AS removido_em
    FROM public.coach_store_hidden_items h
   WHERE h.id IN ('fadad302-7c75-432f-8c7b-b4d0b07a04c3',   -- Nathan Utuari
                  '0d076cec-8008-4c2c-9bbf-cdec2224812f');  -- Tatiane

DELETE FROM public.coach_store_hidden_items
 WHERE id IN ('fadad302-7c75-432f-8c7b-b4d0b07a04c3',
              '0d076cec-8008-4c2c-9bbf-cdec2224812f')
   AND target_type = 'vendor_fitmind';

-- Para desfazer, se algum dos dois esconder de proposito:
--   INSERT INTO public.coach_store_hidden_items (id, coach_id, target_type, product_kind, target_id, created_at)
--   SELECT id, coach_id, target_type, product_kind, target_id, created_at
--     FROM auditoria.ocultacoes_fitmind_20260917 WHERE coach_id = '<coach>';

-- ============================================================================
-- 56 produtos Herbalife da Arlete nasceram numa secao desativada.
--
-- A fusao de 29/08 (20260829190000) juntou as duas "Suplementos" e as duas
-- "Herbalife" nas ...0001 e desativou as ...0002. Mas `mirrorHerbalifeCatalog`
-- continuou gravando espelho de parceiro na ...0002 — a fusao consertou os
-- dados e nao o codigo que os cria. Em 12/09 o espelho da Arlete caiu la: 56
-- produtos aprovados, fora da categoria Herbalife que o coach consegue
-- esconder. O codigo foi corrigido no mesmo commit.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auditoria.herbalife_espelho_20260917 AS
  SELECT 'partner_products' AS tabela, pp.id AS registro_id,
         pp.section_id, pp.category_id, now() AS tirado_em
    FROM public.partner_products pp
   WHERE pp.section_id = '11111111-0000-0000-0000-000000000002'
      OR pp.category_id = '22222222-0000-0000-0000-000000000002';

UPDATE public.partner_products
   SET section_id = '11111111-0000-0000-0000-000000000001'
 WHERE section_id = '11111111-0000-0000-0000-000000000002';

UPDATE public.partner_products
   SET category_id = '22222222-0000-0000-0000-000000000001'
 WHERE category_id = '22222222-0000-0000-0000-000000000002';

-- ============================================================================
-- Esconder por categoria nunca funcionou.
--
-- A tela manda target_type = 'category' (a loja antiga desde julho; a nova a
-- partir deste commit) e a leitura ja sabe tratar — `store_visibility_context`
-- devolve a linha e o filtro da loja confere `categoryId`. Mas o CHECK da
-- tabela nunca aceitou 'category': o toque morria em erro de constraint, e o
-- coach ficava sem outro caminho alem de esconder produto por produto.
-- "Herbalife" sao 114 produtos.
-- ============================================================================
ALTER TABLE public.coach_store_hidden_items
  DROP CONSTRAINT coach_store_hidden_items_target_type_check;

ALTER TABLE public.coach_store_hidden_items
  ADD CONSTRAINT coach_store_hidden_items_target_type_check
  CHECK (target_type = ANY (ARRAY[
    'product', 'section', 'category',
    'vendor_partner', 'vendor_professional', 'vendor_fitmind'
  ]));
