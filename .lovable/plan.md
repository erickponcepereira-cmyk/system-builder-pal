## Objetivo
Fazer com que o link "Compartilhar resultado" exiba para o aluno EXATAMENTE a mesma tela que o coach vê em `FitMindShape → Resultado da Avaliação` — mesmo Resumo, Perfil Corporal (avatares), Composição Corporal, Diagnóstico de Obesidade, Outros Indicadores, Cardiovascular, gráficos (peso, pizza composição, gordura×músculo), Idade Corporal, Circunferências, Fontes Clínicas, Anotações e rodapé do Coach.

Hoje a página pública (`/resultado/$token`) tem um layout simplificado próprio, com poucos dados. Vamos:
1. Extrair a `ResultScreen` para um componente isolado e reutilizável.
2. Ampliar o que a função pública de share retorna (histórico, fotos, circunferências, gênero, altura, anotações, logo do coach).
3. Renderizar o mesmo componente na rota pública, dentro de um wrapper com o CTA de cadastro + card do coach.

## Implementação

### 1) `src/components/coach/FitMindShapeResultView.tsx` (novo)
- Move toda a renderização e helpers internos de `ResultScreen` (linhas ~2659–3617 de `FitMindShape.tsx`) para um componente que recebe props:
  - `client` (FitMindClient), `assessment` (FitMindAssessment), `allAssessments` (lista para Resumo e histórico), `coach` (nome, logo, especialidade, email), `themeColor`, `themeFontFamily`, `mode: "coach" | "public"`.
  - Callbacks opcionais: `onBack`, `onShare`, `sharingResult`, `onNewAssessment`, `onCompare`, `onPrint`.
- Move helpers usados só pela tela: `AvatarFigure`, `Tooltip`, `AvatarLabels`, imports de avatares (`bodyAbaixo`...), `CLINICAL_SOURCES`, CSS `fm-result-screen` mínimo.
- Calcula internamente `computedBMI`, `historicalData`, `harrisBenedict`, `pieData` etc. a partir das props.
- No modo `public`: oculta botões "Nova Avaliação", "Comparar", "Gerar Relatório"; oculta botão de share; mostra apenas o conteúdo + botão "Imprimir".

### 2) `src/components/coach/FitMindShape.tsx`
- Substitui o corpo de `ResultScreen` por `<FitMindShapeResultView mode="coach" ... />` repassando estados existentes (`selectedClient`, `assessment`, `historicalData` reconstruído via allAssessments, `coach`, `themeColor`, `themeFontFamily`, `onBack=setScreen("home")`, `onShare=handleShareResult`, `sharingResult`, `onNewAssessment`, `onCompare=setScreen("compare")`, `onPrint=window.print`).
- Remove dali os helpers já movidos (Tooltip, AvatarFigure, CLINICAL_SOURCES, imports de avatares) ou mantém via re-export do novo módulo para evitar quebra de outras telas (verificar uso).

### 3) `src/lib/assessment-share.functions.ts`
- Estende `PublicShareData` com:
  - `gender: "male" | "female"`
  - `height: number | null` (já existe)
  - `photos: { front, back, leftSide, rightSide } | null`
  - `circumferences: Record<string, number | null> | null`
  - `clientNotes: string | null`
  - `history: Array<{ id, date, weight, bodyFat, skeletalMuscle, muscleMass, visceralFat, bodyAge, bmi }>` (todas as avaliações do mesmo `client_id`, ordenadas por data, máx 50)
  - `coachLogo: string | null`, `coachEmail: string | null`
- No handler `getAssessmentShareByToken` adiciona consulta a `coach_evaluation_clients` (gender), `coach_body_assessments` (irmãs) e `coaches.logo_url`/`email` para preencher tudo.

### 4) `src/routes/resultado.$token.tsx`
- Mantém header com Logo + botão Compartilhar (WhatsApp) e card de coach + CTA "Inscreva-se no FitMind Club" no fim.
- Entre o header e o CTA, renderiza `<FitMindShapeResultView mode="public" client={...} assessment={...} allAssessments={history} coach={{name, logo, specialty, email}} themeColor="#dc2626" />` montado a partir de `PublicShareData`.
- Remove as Sections/MetricRow locais.

## Detalhes técnicos
- Tipos `FitMindClient` / `FitMindAssessment` ficam exportados do novo módulo (ou de um `types.ts` ao lado).
- A função `createAssessmentShare` não muda; apenas o retorno do `getAssessmentShareByToken` cresce.
- O modo `public` força tema escuro do wrapper (`#0A0A0A`) mas o conteúdo do `FitMindShapeResultView` mantém as cores originais (cards com fundo claro `#fff` via `.fm-card`) — assim a "cópia exata" do que o coach vê é preservada.
- Sem mudanças de schema: tudo já está em `coach_body_assessments` e `coach_evaluation_clients`.

## Arquivos tocados
- `src/components/coach/FitMindShapeResultView.tsx` (novo, ~650 linhas)
- `src/components/coach/FitMindShape.tsx` (substituição de `ResultScreen`)
- `src/lib/assessment-share.functions.ts` (campos extras no retorno)
- `src/routes/resultado.$token.tsx` (passa a renderizar o componente extraído)
