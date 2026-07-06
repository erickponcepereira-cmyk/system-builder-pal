## Diagnóstico

Rastreei o fluxo de "Avaliar Aluno" (`EvaluateTab.tsx` + `FitMindShape.tsx` + `AssessmentComparison.tsx`) e encontrei os culpados:

### 1) Lentidão ao abrir a tela (>1min no master coach)
`loadClients()` faz, em toda entrada na aba:
- Paginação de **todos** os `coach_evaluation_clients` (master vê a rede inteira).
- Paginação de **todos** os `coach_body_assessments` (mesmo com colunas leves, master pode ter 10k+ linhas).
- Consulta em `coaches` para mapear nomes.
- `loadChallengeCandidates` com joins pesados em `competition_enrollments` + `students` + `profiles` + `groups`.

Tudo isso é **awaited em série antes da tela renderizar**, sem cache entre entradas.

### 2) Lentidão ao salvar (~1min)
Em `saveAssessment` faz `insert` (rápido) e depois `await loadClients()` — refaz TODA a carga acima só para atualizar a linha do aluno editado.

### 3) Busca retorna tudo
Na tela "Selecionar Aluno" o filtro está aplicado ao `scopedClients`, mas quando o master está com scope "Todos os Alunos" e a lista tem centenas de nomes, o `filter` demora e o React re-renderiza o `SelectClientScreen` inteiro a cada tecla (função recriada dentro do componente pai, sem memo). Além disso, o filtro atual usa `includes` sem normalizar acentos, então "andre" não bate com "André". O usuário percebe como "aparece todos abaixo do pesquisado" — na verdade é a lista inteira renderizando lentamente e a que casa aparecendo primeiro por ordenação.

### 4) Comparar não abre com 1 avaliação
`canCompare` já aceita `>= 1`. O problema é que `hydrateClientAssessments` só carrega o payload completo se `onLoadFullAssessments` estiver ligado — e na entrada via `SelectClientScreen` o `hydrated` é setado como novo objeto, mas o `ResultScreen` usa `selectedClient` diretamente. Quando o usuário clica em Comparar, a versão hidratada existe, mas o `AssessmentComparison` recebe `client={selectedClient}` — está OK. O real motivo do "não abre": em algumas máquinas o `hydrate` ainda está pendente e o click cai antes; e quando abre, com 1 única avaliação a UI mostra a tabela vazia porque `selected` começa com `all.slice(0,2)` mas o `useState` inicial só roda 1x — se `all` chega vazio na primeira render (antes da hidratação assíncrona propagar), `selected` fica `[]` para sempre. É bug de estado inicial derivado de prop.

---

## Plano de correção

### A) Cache leve de clientes (sessão)
- Manter um cache em memória (module-scope Map por `coachId`) da lista de clientes já mapeada, com TTL curto (60s) e sem dados sensíveis extras — nome, gênero, grupos, avatar, contagem de avaliações e data da última. **Sem CPF/telefone/e-mail no cache**; esses ficam apenas em memória quando o modal de edição pedir.
- Ao entrar na aba, renderizar imediatamente a partir do cache e revalidar em background (stale-while-revalidate).
- Invalidar o cache apenas quando cria/edita cliente ou avaliação (não em toda navegação).

### B) Só contar avaliações no carregamento inicial
Trocar o "fetch all assessments light" por uma consulta agregada:
```
select client_id, count(*) as total, max(assessment_date) as last_at
from coach_body_assessments
group by client_id
```
via RPC ou `select` com `head:true`/agrupamento. Isso reduz de milhares de linhas para uma por aluno.

### C) Avaliações completas só ao abrir o aluno
Já existe `loadFullAssessmentsForClient` e `fullAssessmentsCacheRef`. Vou:
- Garantir que `SelectClientScreen` **não** dependa da lista completa de avaliações para renderizar (usar `assessmentCount`/`lastAssessmentDate`).
- Fazer o `hydrateClientAssessments` popular a lista antes de mudar de tela (já faz), com skeleton curto.
- Manter o cache por aluno até que uma avaliação daquele aluno seja salva/editada/excluída (invalidação pontual — hoje limpa o mapa inteiro).

### D) Save incremental (sem `loadClients` completo)
- Após `insert` da avaliação, atualizar apenas o cliente afetado no state: incrementar `assessmentCount`, atualizar `lastAssessmentDate`, adicionar a nova avaliação no cache do aluno.
- Reservar o `loadClients()` pesado só para casos onde muda vínculo (challenge, integrar cliente).

### E) Fix da busca
- Normalizar acento e case: usar `.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()` nos dois lados.
- Debounce de 150ms no input.
- Extrair `SelectClientScreen` para um componente memoizado real (hoje é função definida dentro do pai — recria a cada render e força re-mount).
- `filtered` via `useMemo` dependendo só de `[scopedClients, searchQuery, groupFilter]`.

### F) Fix do Comparar
- Trocar o estado inicial do `AssessmentComparison` por `useEffect` que recalcula `selected` quando `all` muda de vazio para populado.
- Bloquear o botão Comparar até `hydrateClientAssessments` terminar (pequeno spinner), garantindo que ao entrar a lista já esteja populada.

### G) Modal "Integrar" também mais leve
- Buscar `students` só quando o usuário digitar (>=2 chars), com `ilike` server-side e `limit 30`; hoje traz 2000 linhas + join de coaches sempre.

### H) Confirmação pós-mudanças
Após implementar, vou:
1. Rodar `tsgo` para checar tipos.
2. Abrir o preview via Playwright autenticado como master coach, medir o tempo até "Selecionar Aluno" renderizar, testar busca com/sem acento e abrir Comparar com 1 avaliação, screenshot cada passo.

---

## Arquivos afetados
- `src/components/coach/tabs/EvaluateTab.tsx` — cache, contagem agregada, save incremental, modal Integrar com busca server-side.
- `src/components/coach/FitMindShape.tsx` — extrair `SelectClientScreen` memoizado, busca normalizada + debounce, gate do botão Comparar.
- `src/components/coach/AssessmentComparison.tsx` — inicialização de `selected` reativa a `all`.
- Possível nova migração: função RPC `coach_assessment_counts(coach_id uuid, master boolean)` para retornar contagem/última data por cliente em uma única chamada.

## O que **não** vou mexer
- Regras de RLS já corrigidas para master coach.
- Layout visual do FitMindShape além do necessário para memoização.
- Dados sensíveis (email/telefone/CPF) — continuam sendo buscados sob demanda no modal de edição, nunca cacheados.

Posso seguir para a implementação?
