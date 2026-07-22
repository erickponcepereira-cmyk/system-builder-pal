# Corrigir duplicação na Árvore da Rede

## Causa raiz (confirmada no banco)

Nathan Utuari tem `coaches.upline_coach_id` apontando para o próprio `coaches.id` (auto-referência). Isso faz o código de árvore em `src/lib/network-ranking.functions.ts` renderizá-lo:

- **como upline** (card "Acima de você") — porque `me.upline_coach_id` existe em `byId`
- **como raiz** (card "você")
- **e como filho de si mesmo** na primeira linha (`byUpline.get(coachId)` inclui ele próprio), o que empurra a mesma sub-rede para os níveis abaixo com deslocamento (aparece como 1ª e 2ª linha e também como 2ª e 3ª).

Uma busca no banco mostrou que **só o Nathan tem auto-referência direta** (`upline_coach_id = id`). Porém, 16 coaches são descendentes diretos dele — todos herdam a distorção. Nenhum outro coach tem ciclos.

## O que fazer

### 1. Migration (correção de dados + prevenção)
- Zerar `upline_coach_id` do Nathan (`UPDATE coaches SET upline_coach_id = NULL WHERE id = upline_coach_id`).
- Adicionar `CHECK (upline_coach_id IS NULL OR upline_coach_id <> id)` em `public.coaches` para bloquear auto-referência futura.
- Adicionar trigger `BEFORE INSERT OR UPDATE` que também detecta ciclos maiores (A→B→A) subindo a cadeia até 20 níveis e lança erro se encontrar o próprio id — protege contra o padrão que gerou esse caso.

### 2. Defesa no código (`src/lib/network-ranking.functions.ts`)
Mesmo com a constraint, blindar o `getMyNetworkStructure` para nunca renderizar auto-loops caso apareçam por dados legados:

- Em `buildByUpline`: ignorar filhos onde `child.id === upline_coach_id`.
- Em `getMyNetworkStructure`: se `me.upline_coach_id === coachId`, tratar como sem upline (não renderizar card "Acima de você").
- Em `collectDownline` / `toNode`: filtrar `child.id === parentId` (já protegido por `seen`, mas explicitar evita a linha extra).

## Detalhes técnicos

Arquivos:
- Nova migration SQL (dados + CHECK + trigger anti-ciclo).
- `src/lib/network-ranking.functions.ts` — guards nas 3 funções acima.

Nenhuma mudança em UI/componentes; a árvore de qualquer coach afetado passa a mostrar Nathan como raiz de topo (sem upline), e sua primeira linha volta a conter apenas os coaches reais patrocinados por ele.
