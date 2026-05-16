## Objetivo

Hoje a Loja (`/admin/store` → "Itens da Loja") usa a tabela `store_items` com uma UI financeira antiga (campos fixos: imposto, taxa, comissões L1/L2/L3 em `%`/`R$`). Em paralelo, `/admin/products` tem a calculadora nova (slots paralelos com `slot_group`, tipo `pct_running`, pontos manuais, fluxo visual em tempo real). Vamos **unificar**: a Loja passa a operar sobre `products`, o cadastro de item ganha a calculadora nova na aba Financeiro, e `/admin/products` sai do menu.

## Decisões já confirmadas

- Unificar: store_items deixa de ser usado; tudo passa para `products`.
- Campos financeiros antigos em store_items: removidos (slots são a única fonte de verdade).
- Aba "Motor Financeiro" some do menu — a calculadora vive apenas dentro do item.

## Escopo da mudança

### 1. Banco (migration)

- Adicionar em `products` as colunas que existem só em `store_items` e são necessárias para a vitrine:
  `section_id uuid`, `category_id uuid`, `kind text check (kind in ('physical','digital'))`, `short_description text`, `gallery jsonb default '[]'`, `stock int`, `sku text`, `is_featured bool default false`, `is_active bool default true`, `metadata jsonb default '{}'`.
- Backfill: copiar o único `store_items` existente para `products` (mapeando `name`, `description`, `image_url`, `price`, `original_price`, seção/categoria, kind, stock, etc.). Status `active`, `points_per_sale = 0`.
- Trocar a referência soft em `store_order_items.store_item_id` para apontar para `products.id` (mesmo nome de coluna mantido por enquanto, só muda a semântica — ou renomear para `product_id` numa migration de aliasing). Atualizar o registro existente, se houver.
- Após confirmação visual, `DROP TABLE store_items` em migration separada (passo 5). Numa primeira passada deixamos a tabela vazia para rollback fácil.

### 2. Frontend — Loja Admin

- **`src/components/admin/StoreItemsManager.tsx`**: passar a ler/gravar de `products` em vez de `store_items`. Remover toda a interface antiga da aba "Financeiro" (`FinField`, `tax_percentage`, `commission_*`, `*_mode`) e toda a lógica de cálculo embutida.
- Extrair a calculadora de `src/routes/admin.products.tsx` (`ProductFinancialDrawer`, `SlotCard`, `FlowLine`, `ProgressTrack`, `SummaryGrid`) para um componente reutilizável: `src/components/admin/ProductFinancialEditor.tsx`. O drawer vira um painel embed (sem o wrapper de drawer) que recebe `productId` e usa `getProductFinancial` / `saveProductFinancial` existentes.
- Na aba "Financeiro" do item: renderizar `<ProductFinancialEditor productId={editing.id} />`. Para item novo, exige salvar a aba "Geral" primeiro (cria o `products`), aí libera a aba financeira.
- Botão "Salvar" da aba Geral grava só os campos não-financeiros em `products`. A calculadora tem seu próprio botão salvar (já existe em `ProductFinancialEditor`).

### 3. Frontend — Vitrine e relatórios

- `src/components/student/StorePage.tsx`, `src/server/coach-sales.functions.ts`, `src/routes/admin.store-reports.tsx`: trocar `from("store_items")` → `from("products")` e remover colunas legadas das selects (`commission_*`, `app_fee_percentage`). Onde a vitrine precisava do valor de comissão para exibição (se precisa), buscar via `product_value_slots` ou esconder.
- `coach-sales.functions.ts`: a comissão do coach passa a vir dos slots (já é o caso para products); remover o cálculo legado baseado em `commission_coach`.

### 4. Menu/rotas

- `src/components/admin/AdminShell.tsx`: remover o item `"Motor Financeiro"` (`/admin/products`) do `navItems`.
- Manter o arquivo `src/routes/admin.products.tsx` por enquanto (acessível por URL direto) para fallback durante a transição; remover num segundo passo após validar.

### 5. Limpeza (migration separada, depois do OK)

- `DROP TABLE store_items`.
- Renomear `store_order_items.store_item_id` → `product_id` se desejado.
- Deletar `src/routes/admin.products.tsx` e `StoreItemsManager` antigo (substituído).

## Arquivos afetados

```text
supabase/migrations/<novo>_unify_products.sql        (criar)
supabase/migrations/<novo>_drop_store_items.sql       (criar, passo 5)
src/components/admin/ProductFinancialEditor.tsx       (novo - extração)
src/components/admin/StoreItemsManager.tsx            (reescrita parcial)
src/components/admin/AdminShell.tsx                   (remover item do menu)
src/routes/admin.products.tsx                         (extrair componente; manter rota)
src/components/student/StorePage.tsx                  (trocar tabela)
src/server/coach-sales.functions.ts                   (trocar tabela + remover legado)
src/routes/admin.store-reports.tsx                    (trocar tabela)
```

## Riscos

- `store_order_items.store_item_id` aponta hoje para `store_items.id` por convenção (sem FK). Ao migrar o item para `products`, o id muda — precisamos preservar o mesmo UUID na cópia para não quebrar pedidos antigos.
- Funções/queries que esperam o shape antigo de `store_items` (campos `commission_*` etc.) vão quebrar até serem atualizadas no mesmo passo.
- Calculadora atual exige um `products.id` salvo antes de configurar slots — UX de item novo exige salvar "Geral" antes de abrir "Financeiro".

## Validação após implementar

1. Criar item novo na Loja → salvar Geral → abrir Financeiro → ver calculadora com slots paralelos, grupo, % do saldo restante e pontos manuais.
2. Editar o item migrado → confirmar dados e slots.
3. Vitrine `/student/store` lista o item normalmente.
4. `/admin/store-reports` e venda de coach continuam funcionando.
5. Item "Motor Financeiro" não aparece mais no menu.
