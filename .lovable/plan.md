## Contexto verificado

- Vitória Berchieli Molina (coach `2c71d17c…`) tem 4 produtos "Locação de Estúdio" (1H, 2H, 5h, 12h), todos com `status=approved`, `is_active_by_professional=true`, `is_ready_for_sale=true`, mesma seção (Marketing) e mesma categoria (Locações).
- A API pública (anon) devolve os 4 produtos.
- Não há registros em `coach_store_hidden_items` que ocultem esses IDs, nem coproduções pendentes.
- Ainda assim, no storefront de profissional só aparece o 1H.

Isso indica um bug de renderização/filtragem no cliente (loja de profissional), não de dados.

## Passos

1. Reproduzir no preview com Playwright entrando como aluno, abrindo a Loja > aba "Profissionais" > seção Marketing > categoria Locações. Capturar o array `cards` real que o componente `PartnerProfessionalStore` recebe (via `console.log` temporário) e printar o DOM/screenshot.
2. Com base no que aparecer, corrigir o ponto exato. Suspeitas prioritárias, na ordem:
  - **De-duplicação por seção/categoria**: em `PartnerProfessionalStore.tsx` a lista `visibleCats` (linha 409) usa `sectionCats.filter((c) => usedCatIds.has(c.id))`, o que é ok, mas se `activeCategory` estiver derivando de `sectionCats[0]?.id` em algum efeito, produtos duplicados na mesma categoria podem estar sendo colapsados por reuso de `key`. Verificar `key={p.id}` no map de `items` (linha 441) e garantir que não há reagrupamento por nome.
  - **Filtro `visibleCards**` (linhas 333-343): confirmar que `vis.isHiddenByUpline` / `vis.isHiddenForViewer` não estão respondendo `true` incorretamente para os duplicados (ex.: chave de visibilidade computada a partir do `section_id`/`category_id` compartilhado, sem `product_id`, ocultando o grupo inteiro exceto o primeiro).
  - **Cache Postgrest / limite**: garantir que a query não tem `limit`/`range` implícito e não sofre paginação silenciosa; adicionar `.limit(500)` explícito por segurança.
3. Corrigir o filtro/render responsável e revalidar com o mesmo Playwright: os 4 cards devem aparecer na categoria Locações.
4. Se a raiz for `useStoreVisibility` calculando chaves duplicadas, incluir o `product_id` na chave (`visibilityKey`) e reescrever os checks para não colapsar produtos que compartilham seção/categoria.

## Fora do escopo

- Alterações em outras lojas (parceiros, Fitmind), a menos que a mesma raiz de bug se aplique — nesse caso aplico o fix simetricamente.
- Alterações na lógica de duplicar produto (o duplicar está salvando corretamente no banco).

vamos aproveitar para unificar as lojas de parceiros e profissionais, eles continuam sendo perfis separadas, mas no front end na loja tanto para aluno, quanto profissional e parceiro quando entrarem na aba loja verem fitmind separado e parceiro/profissional como loja junto. 

&nbsp;

&nbsp;