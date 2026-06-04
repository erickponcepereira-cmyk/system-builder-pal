Esse é um conjunto grande de mudanças que toca várias áreas (base de alunos, modais, desafio, home). Vou organizar em fases para validar antes de implementar.

## Fase 1 — Base de Alunos (CoachStudentsTab)

1. **Cabeçalho com total** — adicionar contador "X alunos" ao lado do título.
2. **Busca por nome** — campo de busca com filtro client-side.
3. **Filtro por classificação** — chips: Todos / Aluno · Aluno Coach · Aluno Profissional · Aluno Parceiro.
   - Buscar `coaches.is_professional`, `partners` e `students` por `profile_id` (mesma lógica já usada em `network-ranking.functions.ts`) para classificar cada aluno.
4. **Ordenação/seções** — adicionar toggles:
   - "Últimos cadastrados" (default, por `created_at desc`).
   - "Sem bioimpedância" (sem `coach_body_assessments`).
   - "Com moedas e sem desafio ativo" (saldo `tokenBalance > 0` e sem participação ativa no desafio).

## Fase 2 — Alertas para o Coach

5. **Alerta no topo da Base de Alunos**: "X alunos entraram há mais de Y dias e ainda não fizeram avaliação!" (Y = 14 dias por padrão).
6. **Alerta na Home do Coach**: mesmo alerta + "Novo aluno cadastrado: NOME" (últimas 48h).
   - Usar um componente novo `CoachAlertsCard` na home.

## Fase 3 — Modais (regra geral)

7. **Desabilitar clique-fora-fecha** em TODOS os modais:
   - `StudentDetailsModal`, `CoachProfileModal`, `PartnerDetailsModal`, `ProfessionalStudentDetailsModal`, `ClientDetailsModal`, `NewSaleModal`, `NewStudentModal`, `StudentReferralModal`, `FreebieDetailModal`, `ProductDetailModal`, `ProductReviewModal`, e o modal de "Trocar coach" em `admin.students.tsx`.
   - Para os que usam `<Dialog>` do shadcn: adicionar `onPointerDownOutside={(e) => e.preventDefault()}` e `onInteractOutside={(e) => e.preventDefault()}` no `DialogContent`.
   - Para os modais custom (div overlay com `onClick={onClose}`): remover o handler do backdrop.

## Fase 4 — StudentDetailsModal (aba Evolução)

8. **Remover bloco "Histórico de peso"** da aba Evolução.
9. **Corrigir fotos corrompidas** — investigar: provavelmente está usando URL pública direta em vez de `createSignedUrl`, ou o bucket é privado. Vou abrir o arquivo, identificar e gerar URLs assinadas via `supabase.storage.from(bucket).createSignedUrl(path, 3600)`.

## Fase 5 — StudentDetailsModal (aba Compras)

10. **Cores por status**: verde = pago, amarelo = pendente, vermelho = cancelado. Aplicar em badge/borda.
11. **Filtro** por status (chips: Todos · Pagos · Pendentes · Cancelados).

## Fase 6 — Desafio: bloquear coaches

12. Na rota `student.challenge.tsx`, antes de renderizar o conteúdo:
    - Buscar `coaches` por `profile_id` do usuário logado.
    - Se existir registro (independente de `is_professional`) OU se for `partners` → renderizar tela bloqueada com mensagem: "Você é coach (ou profissional/parceiro) e não pode participar do desafio. O desafio é exclusivo para alunos."
    - Garantir que `purchase token earn` no backend (cross-sales / challenge-tokens) também não credite moedas para essas pessoas — adicionar guard.

## Detalhes técnicos

- **Classificação reutilizável**: extrair `classifyStudentRow(row, sets)` em `src/lib/student-classifications.ts` (puro, client-side) usando os mesmos critérios já adotados na árvore: Aluno (sempre), e adicionalmente Aluno Coach / Profissional / Parceiro quando o `profile_id` aparecer em `coaches` (com flag) ou `partners`.
- **Carregar conjuntos uma vez** no `CoachStudentsTab` em paralelo com a query de students.
- **Bloqueio de moedas no backend**: editar `challenge-tokens.functions.ts` (ou função equivalente que credita) para retornar 0 / não inserir quando o aluno também é coach/profissional/parceiro.
- **Fotos**: confirmar bucket (provavelmente `assessment-photos`) e trocar `getPublicUrl` por `createSignedUrl` se o bucket for privado.

## Arquivos a editar (resumo)

- `src/components/coach/tabs/CoachStudentsTab.tsx` (busca, total, filtros, ordenações, alerta)
- `src/components/coach/StudentDetailsModal.tsx` (remover histórico de peso, corrigir fotos, filtros/cores em compras, sem click-out)
- `src/components/coach/CoachProfileModal.tsx` e demais modais listados (sem click-out)
- `src/routes/student.challenge.tsx` (bloqueio de coach)
- `src/lib/challenge-tokens.functions.ts` (bloqueio de crédito server-side)
- `src/routes/coach.tsx` ou home do coach (`CoachAlertsCard` novo)
- `src/lib/student-classifications.ts` (novo helper)

Posso seguir com tudo nessa ordem?
