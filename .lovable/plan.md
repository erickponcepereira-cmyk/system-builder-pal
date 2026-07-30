## Objetivo

As tags de limite dos benefícios gratuitos hoje mostram apenas o teto ("2x por semana", "4x por mês"). Passarão a mostrar o consumo do próprio usuário: **"1/2 por semana"**, **"2/8 por mês"**, com destaque quando o limite for atingido.

## Como o uso é contado

Dois caminhos de resgate existem hoje:
- Produtos com agendamento → linhas em `partner_freebie_reservations` (status `reserved`/`used`)
- Produtos sem agendamento → cupons em `partner_coupons` (e `professional_coupons` para profissionais)

Ambos precisam entrar na contagem, por produto, para a semana ISO corrente e o mês corrente.

## Mudanças

1. **Nova função no banco (RPC read-only)** `my_freebie_usage()`
   - Security definer, retorna para o usuário logado: `product_id`, `kind` (partner/professional), `used_week`, `used_month`.
   - Une contagens de `partner_freebie_reservations` (não canceladas), `partner_coupons` e `professional_coupons` do usuário, filtrando por semana ISO atual e mês atual.
   - `GRANT EXECUTE` para `authenticated`.

2. **Hook `useFreebieUsage`** (novo, em `src/lib/`/`src/hooks/`)
   - Chama a RPC via React Query e devolve um `Map<productId, { week, month }>`.
   - Invalidado após reservar cupom/horário para atualizar as tags na hora.

3. **`FreebieLimitTags.tsx`**
   - Passa a aceitar `usedWeekly` / `usedMonthly` opcionais.
   - Rótulo vira `{usado}/{limite} por semana` e `{usado}/{limite} por mês`; sem dados de uso, mantém o formato atual `{limite}x por semana`.
   - Estado "limite atingido": tag em tom âmbar/vermelho com ícone, indicando que não há mais resgates no período.

4. **Telas que usam as tags** — passar o uso vindo do hook:
   - `src/routes/_authenticated/student.freebies.tsx` (lista de gratuitos, parceiros e profissionais)
   - `src/components/student/PartnerFreebieBookingModal.tsx` (reutiliza o contador que já existe para a semana e passa o mensal)
   - `src/components/coach/tabs/BenefitsTab.tsx`

## Notas técnicas

- Semana ISO calculada no banco com `to_char(now() at time zone 'America/Sao_Paulo', 'IYYY-"W"IW')` para casar com a coluna `iso_week` já gravada nas reservas; mês via `date_trunc('month', ...)` no mesmo fuso.
- Reservas canceladas/expiradas não contam; cupons contam a partir de `created_at` (mesma regra usada hoje para bloqueio de resgate).
- Alteração de exibição apenas — os limites e bloqueios de resgate continuam sendo aplicados pelas regras já existentes no banco.
