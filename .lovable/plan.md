# Correções no FitMind Diagnóstico 360

Investiguei o código e localizei a causa raiz de cada bug relatado. Abaixo, o plano por bug.

## 1) Metabolismo Basal aparecendo "Normal" quando está acima

**Onde:** `src/components/coach/FitMindShapeResultView.tsx` (linhas 279–347).

**Causa:** a classificação chama `getBasalMetabolismCategory(basalKcal, harrisBenedict)`, onde `harrisBenedict` é calculado com o **peso atual** da aluna. Como o metabolismo medido praticamente coincide com esse cálculo, a razão fica ≈ 1,0 e sempre cai na faixa "Normal", mesmo com 2042 kcal contra faixa ideal 1520–1806.

**Correção:** classificar contra a faixa saudável (peso ideal), não contra o peso atual:
- Comparar `basalKcal` com `[harrisBenedictFor(idealWeightMin), harrisBenedictFor(idealWeightMax)]`.
- Abaixo do mínimo → "Baixo"; dentro da faixa → "Normal"; acima do máximo → "Acima" (com cor de alerta).
- Ajustar `getBasalMetabolismCategory` (ou substituir a chamada pela nova lógica) para aceitar uma faixa `[min, max]`.

## 2) Idade errada (Alcinata 07/01/1980 mostrando 45 em vez de 46)

**Onde:** `src/lib/water-goal.ts::calcAgeFromBirthdate`, `src/components/coach/FitMindShapeResultView.tsx` (usa `a.age` snapshot), `StudentDetailsModal.tsx`, `ProfessionalStudentDetailsModal.tsx`, `ClientDetailsModal.tsx`, `ProfessionalStudentsTab.tsx`.

**Causas combinadas:**
1. `new Date("1980-01-07")` é interpretado em UTC — em Brasil (UTC-3) volta 1 dia (06/01) e pode causar off-by-one.
2. Alguns componentes exibem `a.age` gravado no momento da avaliação (snapshot de 16/12/2025 → 45), em vez da idade atual.
3. Datas digitadas em `DD/MM/YYYY` passam por `new Date(...)` que interpreta como MM/DD em alguns navegadores.

**Correção:**
- Criar um helper único `parseBirthDate(str)` que aceita `YYYY-MM-DD` e `DD/MM/YYYY` sem TZ shift (usar `Date.UTC` e comparar em UTC), retornando `Date | null`.
- Reescrever `calcAgeFromBirthdate` usando esse parser e comparação em UTC.
- Em todo lugar que hoje mostra idade a partir do assessment, recalcular sempre a partir do `birth_date` do cliente (fonte de verdade), nunca do `age` gravado.
- Reaproveitar o helper em: `FitMindShapeResultView` (header do resultado), `FitMindShape.tsx` (novo/edit cliente), `StudentDetailsModal`, `ClientDetailsModal`, `ProfessionalStudentDetailsModal`, `ProfessionalStudentsTab`, `ProtocolTab`.

## 3) Vinculação não remove os outros cadastros (Elineth em Coach Erick e Coach Kátia)

**Onde:** `src/components/coach/tabs/EvaluateTab.tsx` (linhas 629–738).

**Causa:** o fluxo de "Integrar" só procura duplicatas dentro do `targetCoachId` (coach do próprio card). Se o mesmo `student_id` estiver vinculado a cadastros de outros coaches, esses cadastros permanecem visíveis na Base de Alunos.

**Correção:**
- Ao confirmar a vinculação, buscar TODOS `coach_evaluation_clients` com o mesmo `student_id` (independente de `coach_id`) e mover avaliações + apagar/desvincular conforme a opção "mesclar e apagar".
- Manter apenas 1 cadastro por `(student_id)` no sistema.
- Preservar `evaluation_link_audit` com a lista de cadastros mesclados.
- Após concluir, invalidar cache (`clientSummaryCache`) e recarregar a base.

## 4) Vincular ao Desafio não vincula

**Onde:** função que grava `challenge_id`/`edition_id` no `coach_evaluation_clients` (fluxo Desafio → Avaliação).

**Ação:** localizar o handler chamado ao clicar "Vincular ao Desafio" no card do aluno, verificar se está gravando `challenge_edition_id`/`challenge_group_id` no cliente correto (após a vinculação, o `client.id` pode ter mudado). Ajustar para gravar no cadastro consolidado (o que sobrou após a mesclagem) e refazer o refetch.

## 5) Busca do modal "Integrar" fica em branco / "Nenhum aluno encontrado"

**Onde:** `src/components/coach/tabs/EvaluateTab.tsx::runLinkSearch` (linhas 567–610).

**Causa:** o filtro `q.or("name.ilike.%…%,email.ilike.%…%", { foreignTable: "profiles" })` aplica o filtro no embed sem `!inner join`. Quando o PostgREST não encontra a coluna no embed, retorna array vazio silenciosamente.

**Correção:**
- Usar `profiles!inner(name,email)` no `select` e filtrar em `profiles.name`/`profiles.email` sem `foreignTable`, OU
- Fazer 2 queries: primeiro `profiles` (`ilike` em `name`/`email`, limit 30) para obter `profile_ids`, depois `students` (`in profile_id`).
- Aumentar o `limit` só quando houver termo digitado; sem termo, mostrar os 20 mais recentes.

## 6) "Meus alunos" listando muitos que não batem com o termo

**Onde:** mesma tela; o filtro atual retorna os 30 mais recentes independentemente do termo quando o `or(...)` no embed falha.

**Correção:** consequência automática da correção 5 (filtro real por nome). Adicionar também um filtro client-side de segurança: se `term` estiver preenchido, remover linhas cujo `profiles.name`/`email` não contenham o termo (case/diacritic-insensitive).

## 7) "Ana Flávia (eu)" duplicado 5× na Base de Alunos

**Onde:** `src/components/coach/FitMindShape.tsx` (lista `clients`) e loader em `EvaluateTab.tsx::loadClients`.

**Causa:** cada nova avaliação do próprio coach ("self") gera um novo `coach_evaluation_clients` porque não há dedupe por `student_id` quando o cliente é o próprio coach.

**Correção:**
- No loader `loadClients`, deduplicar por `student_id` (quando presente), mantendo o cadastro mais antigo e mesclando avaliações dos demais no cliente.
- Migração adicional (opcional, revisada em segunda etapa): índice único parcial `unique (coach_id, student_id) where student_id is not null` em `coach_evaluation_clients` para impedir novas duplicatas.
- Rodar uma limpeza única (server function admin) que consolida cadastros "self" duplicados do coach logado, movendo `coach_body_assessments.client_id` para o cadastro remanescente.

## 8) Confirmar telemetria dos bugs 3–7

Adicionar `console.warn` temporário em:
- `runLinkSearch` (mostrar `term`, `rows.length`, `error`).
- `requestLinkClientToStudent` (mostrar `existing`, `targetCoachId`).
Remover após validação.

---

## Detalhes técnicos

- Nenhuma migração destrutiva é executada sem revisão adicional. A consolidação de duplicados vai como server function chamada manualmente pelo admin/coach, com dry-run + log.
- Idade sempre derivada de `birth_date` do cadastro (fonte de verdade).
- Metabolismo passa a exigir `idealWeightMin/Max`; se peso/altura/idade faltarem, cai para "—" (sem classificar).
- Busca do modal passa a usar `profiles!inner` — PostgREST filtra corretamente em colunas de embed apenas com `inner join`.
- Dedupe de "self clients" acontece no cliente (imediato) e é reforçada por índice único (etapa 2).

## Escopo fora deste plano

- Redesign visual do modal (mantido).
- Regras de Desafio/patente/carreira (só o vínculo é ajustado).
- Modo teste / bypass de pagamento (implementação anterior mantida).

Depois da aprovação, implemento na ordem 1 → 2 → 5 → 6 → 3 → 7 → 4 → 8, com verificação após cada bloco.
