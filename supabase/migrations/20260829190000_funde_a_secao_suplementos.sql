-- ============================================================================
-- "Suplementos" existia duas vezes, e clicar nela mostrava metade da loja.
--
-- Duas linhas em `store_sections` com o MESMO nome:
--   11111111-...0001  sort_order 7   56 produtos da FitMind
--   11111111-...0002  sort_order 11  58 produtos de parceiro
--
-- E a duplicacao ia um nivel mais fundo: uma categoria "Herbalife" sob cada
-- uma. O carrossel do topo filtra por `section_id`, entao quem tocava em
-- "Suplementos" via 56 OU 58 produtos — nunca os 114. Os outros sumiam sem
-- nenhum aviso, e a pessoa concluia que a loja nao tinha o produto.
--
-- ESCOLHA DA CANONICA: fica a ...0001, que tem `sort_order` menor e portanto ja
-- e a que aparece primeiro no carrossel. Trocar isso mudaria a ordem da vitrine
-- sem motivo.
--
-- NAO APAGA NADA. `store_categories.section_id` e `ON DELETE CASCADE`: apagar
-- uma secao levaria as categorias junto, e com elas o `category_id` de produto
-- que ninguem pediu para mexer. A duplicata e DESATIVADA e renomeada, para
-- ficar legivel no admin o que aconteceu com ela.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- O retrato antes. E a licao que ja salvou este projeto uma vez: congelar o
-- estado numa tabela com data no nome antes de qualquer escrita em massa.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS auditoria.secoes_antes_20260829 AS
  SELECT 'partner_products' AS tabela, pp.id AS registro_id,
         pp.section_id, pp.category_id, now() AS tirado_em
    FROM public.partner_products pp
   WHERE pp.section_id = '11111111-0000-0000-0000-000000000002'
      OR pp.category_id = '22222222-0000-0000-0000-000000000002';

INSERT INTO auditoria.secoes_antes_20260829 (tabela, registro_id, section_id, category_id, tirado_em)
  SELECT 'professional_products', fp.id, fp.section_id, fp.category_id, now()
    FROM public.professional_products fp
   WHERE fp.section_id = '11111111-0000-0000-0000-000000000002'
      OR fp.category_id = '22222222-0000-0000-0000-000000000002';

INSERT INTO auditoria.secoes_antes_20260829 (tabela, registro_id, section_id, category_id, tirado_em)
  SELECT 'products', p.id, p.section_id, p.category_id, now()
    FROM public.products p
   WHERE p.section_id = '11111111-0000-0000-0000-000000000002'
      OR p.category_id = '22222222-0000-0000-0000-000000000002';

-- ----------------------------------------------------------------------------
-- Os produtos mudam de endereco. A categoria "Herbalife" duplicada tambem se
-- funde, senao a secao unica passaria a ter duas categorias identicas.
-- ----------------------------------------------------------------------------
UPDATE public.partner_products
   SET category_id = '22222222-0000-0000-0000-000000000001'
 WHERE category_id = '22222222-0000-0000-0000-000000000002';

UPDATE public.partner_products
   SET section_id = '11111111-0000-0000-0000-000000000001'
 WHERE section_id = '11111111-0000-0000-0000-000000000002';

UPDATE public.professional_products
   SET category_id = '22222222-0000-0000-0000-000000000001'
 WHERE category_id = '22222222-0000-0000-0000-000000000002';

UPDATE public.professional_products
   SET section_id = '11111111-0000-0000-0000-000000000001'
 WHERE section_id = '11111111-0000-0000-0000-000000000002';

UPDATE public.products
   SET category_id = '22222222-0000-0000-0000-000000000001'
 WHERE category_id = '22222222-0000-0000-0000-000000000002';

UPDATE public.products
   SET section_id = '11111111-0000-0000-0000-000000000001'
 WHERE section_id = '11111111-0000-0000-0000-000000000002';

-- ----------------------------------------------------------------------------
-- O que um coach escondeu tem que sobreviver a fusao.
--
-- Se alguem escondeu a duplicata, a intencao era esconder "Suplementos" — e
-- depois da fusao so existe uma. Mover o alvo preserva isso. `ON CONFLICT`
-- porque o coach pode ja ter escondido as duas, e ha unique na tabela.
-- ----------------------------------------------------------------------------
INSERT INTO public.coach_store_hidden_items (coach_id, target_type, product_kind, target_id)
  SELECT h.coach_id, h.target_type, h.product_kind, '11111111-0000-0000-0000-000000000001'
    FROM public.coach_store_hidden_items h
   WHERE h.target_type = 'section'
     AND h.target_id = '11111111-0000-0000-0000-000000000002'
  ON CONFLICT DO NOTHING;

DELETE FROM public.coach_store_hidden_items
 WHERE target_type = 'section'
   AND target_id = '11111111-0000-0000-0000-000000000002';

-- ----------------------------------------------------------------------------
-- A duplicata sai de cena sem ser apagada, e diz o porque.
-- ----------------------------------------------------------------------------
UPDATE public.store_categories
   SET is_active = false,
       name = 'Herbalife (fundido em 22222222-...0001)'
 WHERE id = '22222222-0000-0000-0000-000000000002';

UPDATE public.store_sections
   SET is_active = false,
       name = 'Suplementos (fundido em 11111111-...0001)'
 WHERE id = '11111111-0000-0000-0000-000000000002';

-- ----------------------------------------------------------------------------
-- Trava para nao nascer outra.
--
-- Indice parcial: so vale para secao ATIVA. Secao desativada pode repetir nome
-- — as duas "Herbalife (desativado)" que ja existem sao prova de que isso
-- acontece, e desativar e justamente como este projeto aposenta secao.
-- ----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS store_sections_nome_unico_entre_ativas
  ON public.store_sections (lower(btrim(name)))
  WHERE is_active;

COMMENT ON INDEX public.store_sections_nome_unico_entre_ativas IS
  'Duas secoes ativas com o mesmo nome fazem o filtro do carrossel mostrar so metade dos produtos: ele casa por section_id e o usuario le pelo nome. Aconteceu com Suplementos (56 + 58 produtos).';
