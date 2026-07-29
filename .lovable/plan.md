## O que está acontecendo

Confirmei no banco: o cadastro do Helton está correto — `birthdate = 1995-07-30`.

O erro é de fuso horário na exibição. O `BirthdaysCard` faz `new Date("1995-07-30")`, e o JavaScript interpreta datas nesse formato como **meia-noite UTC**. No horário de Brasília (UTC-3) isso vira **29/07 às 21h**, ou seja, o sistema "acha" que o aniversário é dia 29 — exatamente o sintoma relatado. O mesmo desvio afeta a idade exibida e qualquer lista/filtro de aniversariantes.

Já existe no projeto um utilitário correto (`parseBirthDate` em `src/lib/water-goal.ts`), mas vários componentes não o usam.

## Correção

1. **Utilitário único de data-only**
   Extrair/expor um helper compartilhado (`src/lib/date-only.ts`) com:
   - `parseDateOnly(s)` → interpreta `YYYY-MM-DD` e `DD/MM/AAAA` no calendário local (sem UTC);
   - `formatDateOnlyBR(s)` → exibição `dd/mm/aaaa` sem deslocamento;
   - `calcAge(s)` e `daysUntilBirthday(s)` já corrigidos.
   Reaproveita a lógica de validação existente em `water-goal.ts`, que passa a importar daí (sem duplicar regra).

2. **BirthdaysCard** (`src/components/BirthdaysCard.tsx`)
   - Trocar `parseBd` pela função nova.
   - Corrigir o cálculo de idade: hoje soma `+1` fora do dia do aniversário de forma incorreta em alguns casos; passar a usar a idade que a pessoa fará na próxima data.
   - Marcar "Hoje!" comparando dia/mês no calendário local.

3. **Varredura das demais telas com o mesmo padrão** (`new Date(birth_date)`), corrigindo cada uma:
   - `professional/ClientDetailsModal.tsx`
   - `professional/ProfessionalStudentsTab.tsx`
   - `professional/ProfessionalStudentDetailsModal.tsx`
   - `coach/StudentDetailsModal.tsx`
   - `coach/FitMindShape.tsx` e `coach/tabs/EvaluateTab.tsx` (idade usada em avaliação/protocolo — hoje pode calcular 1 dia a menos e mudar a idade em quem faz aniversário no dia)

4. **Verificação**
   - Conferir no preview que Helton aparece como "amanhã · 30 jul" hoje (29/07) e como "Hoje!" amanhã.
   - Rodar consulta de amostra de perfis com aniversário nos próximos dias para conferir a lista.

## Observações técnicas

Nenhuma migração de banco é necessária — os dados estão corretos, o defeito é só de parsing no frontend. Não altero nenhum fluxo de salvamento (inputs `type="date"` já gravam `YYYY-MM-DD` corretamente).
