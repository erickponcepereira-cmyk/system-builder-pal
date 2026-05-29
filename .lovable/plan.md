
## Mudanças no banco (migration única)

**competition_groups** — turmas agora têm datas totalmente manuais:
- adicionar `start_date date` e `end_date date` (janela total da turma, pode cruzar meses)
- manter `initial_start_date`/`initial_end_date` (janela de pesagem inicial)
- manter `final_weigh_in_date` (data alvo da pesagem final, agora editável)
- admin pode criar/editar/excluir turmas individualmente; remover geração automática obrigatória (manter `generate_competition_groups` opcional)

**competition_enrollments** — adicionar colunas de resultado por bioimpedância:
- `initial_body_fat numeric` / `final_body_fat numeric` — % de gordura
- `initial_muscle_mass numeric` / `final_muscle_mass numeric` — massa muscular
- `initial_assessment_id uuid` / `final_assessment_id uuid` — FK para `coach_body_assessments`
- `initial_share_url text` / `final_share_url text` — link público do FitMindShape para auditoria
- `result_fat_pct_lost numeric` — % de gordura perdida (critério principal)
- `result_muscle_gain_pct numeric` — % de massa muscular ganha
- `result_kg_lost numeric` — kg perdidos (peso)

**coach_body_assessments** — vincular ao desafio:
- `challenge_enrollment_id uuid` (FK opcional)
- `challenge_type text` check ('initial'|'final')
- trigger: ao inserir/atualizar com `challenge_enrollment_id`, copia weight/body_fat/muscle_mass para a coluna correspondente em `competition_enrollments` e calcula resultados

## Admin (`/admin/challenge`)

- **Criar competição**: mês/ano/prêmio (apenas para agrupar no hall). Não gera turmas automaticamente.
- **Gerenciar turmas**: dentro de cada competição expandida — botão "Adicionar turma" com seletores de data início/fim/janela pesagem inicial/data pesagem final (todas dd/mm/yyyy livres). Botão "Excluir turma" com confirmação.
- **Editar turma**: clicar abre o mesmo modal preenchido.

## FitMindShape — vínculo com desafio

- No formulário de avaliação (FitMindShape), adicionar checkbox: "Vincular ao Desafio FitMind" → ao marcar, dropdown mostra inscrições ativas do aluno (pesagem inicial pendente OU final pendente) e seleciona automaticamente o tipo.
- Ao salvar a avaliação, o trigger atualiza `competition_enrollments`.
- O `share_url` (link público de resultado) é capturado e salvo em `initial_share_url`/`final_share_url`.

## Botão "Fazer pesagem" no card do aluno

- No coach (`ChallengeTab` → aba Alunos) e admin: botão "Fazer pesagem inicial/final" deixa de abrir modal de peso e navega para `/coach?tab=evaluate&clientId=<id>&challenge=<enrollmentId>&type=<initial|final>` — pré-marca o checkbox de desafio.

## Hall da Fama (4 abas)

Componente `HallOfFame` refeito com 4 abas:

1. **Vencedores** — apenas entradas em `competition_hall_of_fame` (consagrados). Filtro por mês.
2. **Classificação geral (% gordura perdida)** — TODOS os participantes, ordenados por `result_fat_pct_lost desc`. Filtro: mês + gênero (Todos / Masculino / Feminino). Sem pesagem inicial OU final = vão para o fim com label "Não realizou pesagem".
3. **% Massa muscular ganha** — mesma estrutura, ordenado por `result_muscle_gain_pct desc`.
4. **Kg perdidos** — mesma estrutura, ordenado por `result_kg_lost desc`.

Em cada linha de aluno: foto, nome, coach, valor; ícone 🔗 (apenas admin/coach) abre `share_url` em nova aba para auditoria.

## Aluno

- Mesma reformulação do hall (4 abas, filtros).
- Mensagem "campeão" continua via `competition_hall_of_fame`.

## Arquivos a editar/criar

- `supabase/migrations/<new>_challenge_bioimpedance.sql` (migration)
- `src/routes/admin.challenge.tsx` — CRUD manual de turmas, remover botão de peso manual
- `src/components/coach/tabs/ChallengeTab.tsx` — botão "Fazer pesagem" navega para avaliação
- `src/components/coach/FitMindShape.tsx` (ou form de avaliação) — checkbox + dropdown de desafio, captura `share_url`
- `src/components/HallOfFame.tsx` — 4 abas + filtros gênero
- `src/routes/student.challenge.tsx` — usar novo HallOfFame

## Premissas (ainda preciso confirmar uma)

- **Onde está o "share_url" do FitMindShape hoje?** Vou inspecionar `FitMindShape.tsx` e `assessment-share.functions.ts` para entender o link de compartilhamento e como capturá-lo automaticamente ao salvar a avaliação.
- A premiação continua sendo declarada manualmente pelo admin (botão "Consagrar Vencedor"), agora baseada no ranking da aba "Classificação geral" — o admin escolhe quem consagrar.

Após aprovação, implemento na ordem: migration → admin (CRUD turmas) → FitMindShape (vínculo) → HallOfFame (4 abas) → ajustar ChallengeTab e student.challenge.
