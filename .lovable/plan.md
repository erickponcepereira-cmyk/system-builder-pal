## Reestruturação do Sistema de Carreira

Vou reorganizar a aba **Carreira** do coach em duas seções, conforme o PDF e o texto enviados:

### 1. Aba "Individual" — Hall da Fama FitMind (medalhas)
Reconhecimento da produção pessoal (VP).

**Ordem da Excelência FitMind** — medalhas mensais (VP de um único mês):
- 🥉 Contribuidor R$ 2.500 · Construtor R$ 5.000 · Realizador R$ 7.500
- 🥈 Influenciador R$ 10.000 · Pioneiro R$ 20.000 · Estrategista R$ 30.000
- 🥇 Arquiteto R$ 40.000 · Expansor R$ 50.000
- 🏅 Líder R$ 65.000 · Mentor R$ 85.000
- 👑 Master R$ 100.000

**Clube dos Campeões FitMind** — VP acumulado em toda a carreira:
- 🏆 Clube 100K · 250K · 500K · 1M · 2,5M · 5M · 10M

Cada cartão mostra: status (conquistada/em progresso), valor alvo, valor atual e barra de progresso. Medalhas mensais conquistadas em meses anteriores ficam registradas como histórico.

### 2. Aba "Ordem dos Construtores FitMind" — Carreira com equipe (VP + VE)
21 patentes organizadas em 4 fases (extraído do PDF):

- **Fase 1 — Desenvolvimento Pessoal** (níveis 1–3): Explorador, Contribuidor, Construtor
- **Fase 2 — Resultados e Liderança** (níveis 4–12): Realizador → Master
- **Fase 3 — Expansão** (níveis 13–17): Navegador → Presidente
- **Fase 4 — Legado** (níveis 18–21): Titã → Círculo dos Fundadores

Cada patente passa a guardar: meta (R$), prazo em meses, % máximo de VP, % máximo de VE. A patente atual é a maior alcançada respeitando os limites de VP/VE no prazo da patente.

### Mudanças técnicas

**Banco (migração):**
- Reescrever `patent_rules` com os 21 níveis do PDF (key, display_name, level, required_revenue, time_window_months, vp_max_pct, ve_max_pct, phase). Renomear `min_own_sales_pct` para refletir limite máximo de VP por nível, ou adicionar coluna `vp_max_pct`.
- Nova tabela `coach_medals_individual` (coach_id, medal_key, month/year para mensais, awarded_at) — para registrar medalhas mensais conquistadas como histórico permanente.
- Nova tabela `career_medal_rules` com os dois conjuntos (Ordem da Excelência mensal e Clube dos Campeões acumulado), para o admin auditar.

**Server function:**
- Estender `getCareerProgress`: retornar também (a) VP do mês atual, (b) VP acumulado total, (c) medalhas mensais já conquistadas, (d) progresso por patente da Ordem dos Construtores agrupado por fase.
- Job/cron já existente (`career.reset-expired`) — adaptar para também "carimbar" a medalha mensal do coach no fechamento do mês.

**Frontend:**
- `CareerTab.tsx` vira um wrapper com duas tabs ("Individual" | "Ordem dos Construtores FitMind").
- Novo `IndividualCareerTab`: lista medalhas mensais (mês atual + histórico) e clubes acumulados.
- Renomeado `ConstructorsCareerTab` (atual conteúdo da `CareerTab`): mostra as 21 patentes agrupadas por Fase, destacando a atual e a próxima.
- Página admin `admin.patents` atualizada para refletir o novo schema.

### Pergunta antes de prosseguir
1. **Histórico de medalhas mensais** — devo começar a registrar agora (não há histórico anterior, somente do mês atual em diante), ou você quer que eu tente reconstruir retroativamente a partir das transações pagas existentes?
2. **Patentes atuais dos coaches** — quer que eu recalcule a patente de todos os coaches já cadastrados com base no novo sistema, ou mantém a patente atual e o recálculo acontece naturalmente quando rodar o próximo ciclo?
