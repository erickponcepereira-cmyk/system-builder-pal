## Diagnóstico (confirmado no banco)

Os dois produtos do Helton usam **a mesma agenda** (mesmo `coach_id`), e a RPC `list_professional_available_slots` já bloqueia horários já agendados em qualquer produto (`professional_appointments` filtra por `professional_coach_id`, não por produto). Ou seja, a regra "agendou em um, bloqueia no outro" **já funciona**.

O motivo de um produto mostrar horários e o outro não é a duração:

- **Avaliação (R$ 129,99)** → `default_duration_minutes = 30`
- **Consulta (R$ 285,00)** → `default_duration_minutes = 60`
- **Acompanhamento (R$ 789,90)** → `default_duration_minutes = 60`

A agenda do Helton está cadastrada como **6 janelas separadas de 30 min** (14:00–14:30, 14:30–15:00, … 16:30–17:00). A RPC itera janela por janela e sai do loop assim que `slot_end > end_time` da janela. Para 60 min, nenhum slot cabe em uma janela de 30 min → "não tem horários disponíveis nos próximos 90 dias", mesmo havendo 3h corridas livres.

## Correção proposta

Alterar `public.list_professional_available_slots` para, antes de gerar slots, **mesclar janelas contíguas do mesmo dia da semana** (fim de uma = início da outra, mesmo `slot_minutes`) em uma única faixa. Assim, 14:00–17:00 vira uma faixa única e cabem slots de 60 min a cada 30 min (14:00, 14:30, 15:00, 15:30, 16:00).

Nada muda no restante do comportamento:
- Continua respeitando `professional_availability_blocks` (bloqueios de dia).
- Continua checando conflito em `professional_appointments` e `external_appointments`, então **um agendamento em qualquer produto bloqueia o mesmo horário nos demais** do mesmo profissional.
- Continua com fuso `America/Sao_Paulo`.

## Detalhes técnicos

Migration nova (`CREATE OR REPLACE FUNCTION public.list_professional_available_slots`) com a mesma assinatura. Substituir o `FOR v_avail IN SELECT * FROM professional_availability …` por um CTE recursivo/janela que agrupa faixas contíguas por `weekday` e `slot_minutes`, algo como:

```sql
WITH ordered AS (
  SELECT weekday, start_time, end_time, slot_minutes,
         LAG(end_time) OVER (PARTITION BY weekday, slot_minutes ORDER BY start_time) AS prev_end
  FROM public.professional_availability
  WHERE professional_coach_id = _coach_id AND is_active = true
    AND weekday = EXTRACT(DOW FROM v_day)::int
),
grp AS (
  SELECT *, SUM(CASE WHEN prev_end = start_time THEN 0 ELSE 1 END)
             OVER (PARTITION BY weekday, slot_minutes ORDER BY start_time) AS g
  FROM ordered
)
SELECT weekday, MIN(start_time) AS start_time, MAX(end_time) AS end_time, MIN(slot_minutes) AS slot_minutes
FROM grp GROUP BY weekday, slot_minutes, g;
```

O restante do corpo (loop de geração + checagem de conflito) permanece igual.

Sem mudanças no frontend, sem mudanças em outras tabelas, sem alteração da agenda existente do Helton.

## Verificação após aplicar

1. Chamar a RPC para o coach do Helton com `_duration_minutes=60` — deve retornar slots 14:00/14:30/15:00/15:30/16:00 nas próximas sextas.
2. Simular reserva em um produto de 30 min às 14:30 e chamar a RPC de 60 min — o slot 14:00 e 14:30 devem sumir; 15:00 permanece.
3. Abrir o modal "Consulta Helton" no app — o calendário passa a mostrar disponibilidade.
