## Diagnóstico (confirmado no banco)

A aluna **Bianca Leandro Sousa Silva** (student_id `cecfaa78…`) tem **3 registros duplicados** em `coach_evaluation_clients`:

| client_id | coach_id | criado em |
|---|---|---|
| `5fedc74b…` (nome minúsculo) | coach 0dc01639 (titular) | 06/07 |
| `d881866c…` | coach 0dc01639 (titular) | 25/07 |
| `fbd608fd…` | coach 20580821 (**master coach — o usuário**) | 27/07 (agora) |

As **3 avaliações reais** (incluindo a de 25/07 vinculada ao desafio com peso 67,4 kg / IMC 26,7 / gordura 42,7%) foram gravadas apenas em `client_id = 5fedc74b…`.

O que a `EvaluateTab` faz hoje:
1. Lista clientes usando `coach_evaluation_client_summaries` e faz um **dedup por `student_id`**, mostrando "3 avaliações" agregadas — mas mantém só **um** `client_id` (o "prev") na entrada consolidada.
2. Quando o card é aberto, `loadFullAssessmentsForClient(clientId)` busca em `coach_body_assessments` **filtrando por esse único `client_id`**. No caso do master coach, o client_id vencedor é o dele (`fbd608fd…`), que tem **0 avaliações reais**.
3. A lista da UI cai nos **stubs zerados** montados pelo próprio código (linhas 238-248: `weight: 0, bmi: 0, bodyFat: 0…`), gerando exatamente o card "25 de jul. de 26 (atual) — 0 kg · 0 % gord. · IMC 0".

Ou seja: os dados **não foram perdidos** — estão salvos em `5fedc74b…` com o desafio corretamente vinculado. O bug é de leitura: histórico é buscado por um `client_id` só, quando na verdade existem N cadastros duplicados do mesmo aluno.

## Correção

### 1. Backfill de dados (migração SQL)
Consolidar `coach_evaluation_clients` duplicados por `student_id`:
- Para cada `student_id` com mais de uma linha, escolher o registro mais antigo como **canônico**.
- `UPDATE coach_body_assessments SET client_id = <canônico>` em todas as avaliações apontando para as duplicatas.
- Migrar dependências equivalentes (fotos, protocolos etc. que também referenciam `coach_evaluation_clients.id`).
- `DELETE` das linhas duplicadas de `coach_evaluation_clients`.
- Reprocessar Bianca especificamente para validar (deve sobrar apenas `5fedc74b…` com 3 avaliações).

### 2. Prevenção (trigger + índice)
- Índice único parcial: `UNIQUE (student_id) WHERE student_id IS NOT NULL` em `coach_evaluation_clients`. Um único cadastro por aluno vinculado, independentemente do coach que abriu a ficha.
- Ajustar `ensure_coach_evaluation_client_for_student` (função existente) para **reaproveitar** o cadastro existente do aluno em vez de criar um novo por coach.

### 3. Frontend — `EvaluateTab.tsx`
- Trocar `loadFullAssessmentsForClient(clientId)` para buscar avaliações por `student_id` quando o cliente estiver vinculado (`studentId`), caindo em `client_id` só para casos "self / sem aluno".
- Após o backfill, o dedup atual continua correto (fica só um `client_id` por aluno) mas essa mudança garante que master coaches e coaches secundários vejam o histórico completo mesmo em cenários novos.
- Remover a substituição por stubs zerados no render de detalhe: se `assessments` está vazio após o fetch real, mostrar "Sem avaliações registradas" em vez de um card `0 kg · IMC 0`.

## Detalhes técnicos

Tabelas envolvidas: `coach_evaluation_clients`, `coach_body_assessments` (FK `client_id`), possivelmente `student_protocols` / `evolution_photos` (verificar FKs antes do delete).

Arquivos frontend a editar:
- `src/components/coach/tabs/EvaluateTab.tsx` (`loadFullAssessmentsForClient`, remoção de stubs de valor zero na visualização de detalhe).
- Nenhuma mudança em `AssessmentComparison.tsx` — ele consome o array retornado.

Ordem de aplicação: (1) migração de backfill + índice/trigger → aprovar; (2) ajustes no frontend após regeneração dos tipos.

## Resultado esperado

- Bianca (e demais alunos com duplicatas) passam a mostrar **as 3 avaliações reais** com peso/IMC/gordura corretos, incluindo o vínculo com o desafio.
- Novos acessos por master coach ou troca de coach titular **não** criam mais fichas paralelas — histórico único por aluno.
- Cards zerados "0 kg · IMC 0" desaparecem.
