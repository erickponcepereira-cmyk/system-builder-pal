## O que eu verifiquei no banco e no código

1. **"Biblioteca de ebooks" não sumiu por bug de código: ela está desativada.**
   A seção `Biblioteca de ebooks` está com "ativa = não" (alterada hoje, 01:46). Com ela desativada, some da loja a seção inteira, a subcategoria "Relacionamentos" e o produto "Atração Feminina - Termômetro Energético Parte 1", que é o único item ligado a ela.

2. **Os ebooks "Nutricionais" existem, mas estão aguardando aprovação.**
   Na seção `Ebooks` (parceiros/profissionais) existem hoje:
   - "Manual de Uma Perfumista" → subcategoria **Feminilidade**, status **aprovado** (aparece);
   - "Guia de Receitas Helton", "Manual do Pré e Pós Treino Helton", "Kit Alimentação Inteligente Helton" → subcategoria **Nutricional**, status **pendente** (não aparecem).
   Como a loja só mostra subcategorias que tenham pelo menos um produto visível, a subcategoria "Nutricional" desaparece e a seção Ebooks fica parecendo "só Feminilidade". Não há mistura de produtos entre subcategorias — o filtro por subcategoria no código está correto.

3. **Produtos sem seção ficam invisíveis para sempre.**
   Hoje: 4 produtos de profissional e 5 de parceiro aprovados e ativos estão **sem seção/subcategoria**. A navegação da loja é 100% por seção → subcategoria → produto, então esses itens nunca aparecem, e nem o vendedor nem o admin recebem qualquer aviso.

4. **Na loja FitMind, produtos de profissional perdem a seção.**
   Em `StorePage.tsx` os produtos de profissional são carregados sem `section_id`/`category_id`, sendo agrupados apenas por um rótulo "Parceiros · Especialidade". Ou seja, o mesmo produto se comporta diferente conforme a aba da loja — origem de boa parte da sensação de "produto sumiu / mudou de lugar".

## O que vou fazer

### 1. Restaurar o que sumiu (imediato)
- Reativar a seção "Biblioteca de ebooks" (e sua subcategoria), devolvendo o ebook ligado a ela.
- Deixar visível no admin, na lista de seções, um aviso claro do tipo "inativa — X produto(s) ocultos", para desativar sem perceber nunca mais acontecer em silêncio.

### 2. Tornar visível o que está "pendente" ou "sem lugar"
- Painel do dono do produto (profissional/parceiro): faixa de alerta listando os próprios produtos **pendentes de aprovação** e os **sem seção/subcategoria**, com link direto para corrigir.
- Painel admin da loja: novo bloco "Produtos que não aparecem na loja" reunindo, em um só lugar, produtos pendentes, sem seção e produtos presos em seção/subcategoria inativa — com ação de aprovar ou reclassificar.

### 3. Uniformizar as subcategorias na loja
- Na loja FitMind, passar a carregar `section_id`/`category_id` dos produtos de profissional e usá-los na navegação, com o agrupamento por especialidade só como fallback para quem ainda não tem seção. Assim o mesmo produto fica no mesmo lugar em todas as abas da loja.
- Mostrar subcategoria vazia com o texto "nenhum produto disponível no momento" em vez de sumir da tela, para não parecer que a categoria foi apagada.

### 4. Conferência final
- Revisar seção a seção (Ebooks, Nutricionistas, Biblioteca de ebooks, Suplementos, Academias) comparando o que existe no banco com o que a loja mostra, e reportar os produtos que continuarem ocultos e o motivo de cada um.

## Detalhes técnicos

- Reativação da seção: alteração de dados (`store_sections.is_active`), não de schema.
- `src/components/student/StorePage.tsx`: incluir `section_id,category_id,subcategory_id` no select de `professional_products` e mapear para `sectionId/categoryId/subcategoryId`; manter o rótulo por especialidade apenas quando `section_id` for nulo.
- `src/components/store/PartnerProfessionalStore.tsx`: manter o filtro atual, mas renderizar subcategorias sem itens com estado vazio em vez de removê-las (`visibleCats`).
- `src/components/admin/StoreManager.tsx`: contagem de produtos por seção/subcategoria e destaque para inativas com produtos vinculados.
- Novo painel de diagnóstico da loja consultando `professional_products` / `partner_products` / `products` por `status='pending'`, `section_id is null` ou seção/subcategoria inativa.

## Pergunta rápida
Confirmo a reativação da "Biblioteca de ebooks" — ou ela foi desativada de propósito e os ebooks devem ser movidos para a seção "Ebooks"?
