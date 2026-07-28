## Problemas confirmados

1. **Nome fixo "FitMind"** — o nome está escrito diretamente no código em vários cabeçalhos, ignorando o tema do white label:
   - `src/components/student/MobileShell.tsx` (topo do app do aluno): `FitMind`
   - `src/components/layout/Header.tsx`: `FitMind Club`
   - `src/routes/_authenticated/portal-selector.tsx`: `FitMind Club`
   - `src/components/admin/AdminShell.tsx`: `FitMind Club` / `FitMind Club Admin`
   - rodapés/versão (ex.: `FitMind Club v1.0.0` no perfil do aluno)

2. **Tema preso em preto/vermelho** — as telas usam classes fixas em vez dos tokens do tema. Contagem de ocorrências de `text-white` / `bg-white/x` / `bg-black/x` / vermelho fixo:
   - Aluno: `student.profile.tsx` (71), `student.workout.tsx` (109), `student.freebies.tsx` (55), `student.index.tsx` (37), `student.protocol.tsx` (31), `student.card.tsx`, `student.evolution.tsx`, e outros
   - Coach: `ProtocolTab.tsx` (163), `WalletTab.tsx` (52), `BenefitsTab.tsx` (41), `EvaluateTab.tsx` (27), `CoachProfileTab.tsx` (34), carreira, rede, etc.

## O que será feito

### 1. Nome da marca dinâmico
- Trocar todos os textos fixos de marca pelo nome do tema (`useBranding().theme.name`), nos cabeçalhos de aluno, coach, parceiro, admin, seletor de portal e rodapés.
- No admin de Identidade Visual, acrescentar um campo **"Nome curto"** (usado no topo do app, onde hoje aparece só "FitMind"), com padrão igual ao nome exibido. Requer uma coluna nova na tabela de temas (`nome_curto`).
- Também aplicar o nome do tema no `<title>` das páginas internas onde hoje está "— FitMind Club".

### 2. Camada de compatibilidade de cores (correção imediata e ampla)
Adicionar, em `src/styles.css`, regras que redirecionam as classes fixas para os tokens do tema **apenas quando o tema é claro** (`html.light`):
- `text-white` → `var(--foreground)`; variações `text-white/40`, `/50`, `/70` → foreground com opacidade
- `bg-white/5` … `bg-white/20` → tinta baseada no foreground
- `bg-black/60`, `bg-black/70` (fundos de modal) → sobreposição baseada no background do tema
- vermelhos fixos (`text-red-500`, `bg-red-500`, `#FF4A3D`, etc.) → `var(--primary)`

Isso resolve o "preto e vermelho preso" em todas as telas de uma vez, sem risco de regressão no tema escuro padrão.

### 3. Refatoração dirigida (arquivos mais críticos)
Substituir de vez as classes fixas por tokens semânticos (`text-foreground`, `bg-card`, `border-border`, `text-primary`, `bg-muted`) nos arquivos que o usuário citou e nos de maior peso visual:
- `src/routes/_authenticated/student.profile.tsx` (perfil do aluno)
- `src/components/coach/tabs/EvaluateTab.tsx` + `src/components/coach/StudentEvaluationPanel.tsx` (avaliar aluno)
- `src/routes/_authenticated/coach.tsx` e `src/routes/_authenticated/student.index.tsx` (cabeçalhos/cards principais)
- `src/routes/_authenticated/portal-selector.tsx` (tela "Entrar como")

### 4. Verificação
- Abrir preview com o tema **Divas Power** (claro) aplicado e conferir: topo com o nome correto, perfil do aluno legível, avaliar aluno sem vermelho FitMind, seletor de portal coerente.

## Detalhes técnicos
- `brand_themes` ganha `nome_curto text`; `rowToTheme`/`BrandTheme` expõem `shortName` com fallback para `name`; o painel `admin/branding` ganha o campo e o schema Zod em `admin-branding.functions.ts` é atualizado.
- A camada de compatibilidade fica em um bloco `@layer utilities` no final de `src/styles.css`, escopado por `html.light` (e por `html[data-theme]` quando necessário), para não alterar o visual do tema FitMind escuro.
