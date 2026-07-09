
## 1) Dias de carteirinha na loja FitMind

**Diagnóstico:** o badge `🪪 Xd carteirinha` já existe no grid da loja e no modal de detalhe, mas os selects em `StorePage.tsx` (`products` para challenges/plans e `products` para itens de seção) **não incluem** a coluna `card_access_days`. Resultado: `cardDays` chega sempre `0` e o badge nunca aparece.

**Correção:** adicionar `card_access_days` aos dois selects em `src/components/student/StorePage.tsx` (linhas 148 e 152). Nada mais muda — a renderização já está pronta.

Vendas por `digital_products` e `store_products` não têm coluna `card_access_days` no banco, então continuam sem badge (é fora do escopo pedido).

## 2) Ocultamento assimétrico com base no criador

**Regra final** (produto P criado pelo coach C, ocultado pelo coach U):
- Um viewer V só é afetado pela ocultação se **U está na cadeia upline de V**.
- Se, além disso, **C também está na cadeia de V numa posição abaixo de U** (ou V é o próprio C), o ocultamento é **ignorado** para V.
- Caso contrário, o produto fica oculto.

Isso cobre os dois casos do exemplo (Nathan/Ana) automaticamente.

**Escopo aplicado (conforme escolha):**
- Ocultamento de produto individual: `partner_product`, `professional_product`, `item` (products com kind), `store_product`, `digital`.
- Ocultamento vendor-wide (`vendor_partner`, `vendor_professional`, `vendor_fitmind`): mesma regra, usando o criador do produto que está sendo avaliado no momento — o filtro passa a receber o `creator_coach_id` do item e decide caso a caso.
- Ocultamento por seção/categoria: mantém comportamento atual (não têm "criador").

**Onde fica no banco:**

Nova função `public.store_visible_for_viewer(_creator_coach_id uuid, _target_type text, _product_kind text, _target_id uuid)` que retorna `boolean`. Ela:
1. Monta a cadeia upline do viewer com profundidade (`get_viewer_upline_chain_with_depth`).
2. Verifica todos os hides ativos aplicáveis (por `target_id`, ou vendor-wide compatível com o `product_kind`).
3. Para cada hide, checa a exceção do criador: se `_creator_coach_id` = viewer_self ou está na cadeia com `depth < depth(hider)`, ignora esse hide.
4. Retorna `true` se nenhum hide sobrar.

Também substituímos `store_hidden_for_viewer()` por `store_hidden_for_viewer_v2()` que retorna, além de `target_type/product_kind/target_id`, o `hider_coach_id` e `hider_depth`, para o cliente poder aplicar a exceção sem uma chamada por item.

**Fonte do `creator_coach_id`:**
- `products` (challenges/items) → coluna `creator_coach_id` existente.
- `professional_products` → coluna `coach_id`.
- `partner_products` → derivar via `partners.upline_coach_id` (parceiro sempre tem coach upline responsável).
- `digital_products` / `store_products` → não têm criador coach → exceção nunca se aplica (comportamento antigo).

**Mudança no front (`coach-store-overrides.ts` + `StorePage.tsx` + `PartnerProfessionalStore.tsx`):**
- `useStoreVisibility` passa a guardar a lista completa `hiddenRows` com `hider_coach_id` e `hider_depth`, além do mapa `viewerChain: Map<coach_id, depth>` do viewer.
- Nova função `isHiddenForViewer(targetType, kind, targetId, creatorCoachId)`:
  - Filtra hides aplicáveis ao alvo (id-exato ou vendor-wide equivalente).
  - Para cada hide, aplica a exceção do criador.
- Todos os call-sites que hoje chamam `isHiddenForViewer(...)` / `isHiddenByUpline(...)` passam a informar o `creatorCoachId` do item (já mapeado nos dados da loja: `creatorCoachId` para items/challenges, `professionalCoachId` para produtos de profissional, `coach.id` para produtos de parceiro).

## 3) Verificação
- Loja FitMind: badge de carteirinha volta a aparecer em produtos com `card_access_days > 0`.
- Cenário Nathan/Ana:
  - Ana oculta produto do Nathan → invisível só para descendentes de Ana.
  - Nathan oculta produto criado por Ana → invisível para todos exceto Ana e sua downline.
- Ocultamento por seção/categoria continua comportamento atual.

## Arquivos afetados
- `src/components/student/StorePage.tsx` — adicionar `card_access_days` nos selects; passar `creatorCoachId` para checagens de visibilidade.
- `src/lib/coach-store-overrides.ts` — novo shape (rows + chain) e nova assinatura de `isHiddenForViewer`.
- `src/components/store/PartnerProfessionalStore.tsx` e demais consumidores — repassar `creatorCoachId` nas chamadas.
- Nova migration SQL: `store_hidden_for_viewer_v2()` + índice de apoio se necessário.
