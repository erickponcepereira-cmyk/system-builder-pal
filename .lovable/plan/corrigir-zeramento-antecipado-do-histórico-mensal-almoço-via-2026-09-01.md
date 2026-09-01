# Corrigir zeramento antecipado do histórico mensal (almoço/viagem)

## O que aconteceu

Os planos de premiação (almoço, viagem etc.) vêm de `career_plan_config` e a pontuação do mês é somada em `src/lib/coach-rewards.functions.ts`. A janela do mês é montada com `new Date(now.getFullYear(), now.getMonth(), 1)` — que no servidor roda em **UTC**, não no fuso do app (Cuiabá, UTC-4).

Agora são 21h55 de 31/08 em horário local, mas já é 01/09 em UTC. Por isso a janela pulou para setembro e o histórico do mês apareceu zerado, mesmo com agosto ainda em curso. Todo fim de mês, das 20h (ou 21h) até a meia-noite local, o mesmo zeramento acontece.

O projeto já tem o helper correto: `tzCurrentYearMonth()` / `TZ_OFFSET` em `src/lib/timezone.ts` (usado, por exemplo, em `coach-medals.functions.ts`).

## Correção

Em `src/lib/coach-rewards.functions.ts`, na função `windowForPlan`:

- Para `monthly_challenge`: calcular início e fim do mês a partir de `tzCurrentYearMonth()`, montando os instantes com o offset `-04:00` (início = 1º dia às 00:00 local; fim = 1º dia do mês seguinte às 00:00 local).
- Para `period` (janela de N meses): ancorar o fim no "agora" e o início em N meses atrás usando a mesma base de fuso local, em vez do calendário UTC.

Nenhuma mudança de regra, de dados ou de meta de pontos: apenas a fronteira do mês passa a respeitar o fuso do app. Os pontos de agosto voltam a aparecer imediatamente e o histórico só zera à meia-noite local do dia 1º.

## Verificação

Após a mudança, conferir no painel do coach que o plano mensal mostra novamente os pontos de agosto e que o período exibido é 01/08 a 31/08 (local).
