---
name: fitmind-fechamento-da-rede
description: "A regra de fechamento mensal da rede do FitMind: comissão de quem não bateu meta sobe para o primeiro upline que bateu, e o que já foi executado"
metadata:
  node_type: memory
  type: project
---

Decidido e executado em 22/08/2026. Ver [[fitmind-sistema-de-taxas]].

**A regra (decisão do Erick):** comissão de rede de quem **não bateu a meta do
mês** sobe para o **primeiro upline que bateu naquele mesmo mês**. Se ninguém na
linha acima bateu, vai para o **sistema**.

Antes disso, esse dinheiro ficava em `pending` **para sempre** — não expirava,
não voltava para a empresa, não subia. Um passivo eterno que crescia todo mês.

**A meta** é pontos: soma de `coach_points_log.points` do mês vs
`pointsRequiredForLevel(patente)`. A regra mora em
`src/lib/network-unlock.server.ts` (TypeScript, não no banco) e é gravada em
`network_unlock_history` por cron mensal ou botão do admin. **Mês sem snapshot
conta como não batido** — esquecer de rodar prende o dinheiro de todo mundo.

**O que foi construído:** tabela `network_month_transfers` (o razão) e a função
`fechar_rede_do_mes(ano, mes, admin_user_id, simular)`. Duas travas: recusa mês
corrente ou futuro, e recusa mês em que alguém com comissão de rede esteja sem
snapshot. A comissão original vai para status `cancelled`, que o
`recalc_wallets_for_owner` já ignora — **nenhuma linha da função de saldo foi
tocada**.

**Executado em 22/08/2026:** julho fechou com R$ 87,47 em 17 comissões subindo
para o Nathan Utuari; junho com R$ 0,08 em 3 subindo do Erick para a Ana Flávia.
Total no razão: R$ 87,55 em 20 linhas. Conferido: o disponível do Nathan foi de
0,00 para 87,47 e o pendente das seis pessoas caiu exatamente o valor que subiu.
Agosto **não** foi fechado — a trava recusou, porque o mês não terminou.

**Também aplicado:** `admin_advance_commission_release` passou a recusar
antecipação de comissão de rede com meta não batida, e o retorno dela deixou de
somar comissões já antecipadas antes.

**Como rodar todo mês:** primeiro o snapshot do mês, depois
`fechar_rede_do_mes(ano, mes, <user_id admin>, true)` para simular, e só então
com `false`. O `user_id` do Erick é `f974165f-afe8-4bba-9c8c-2d79659af5e9` —
`auth.uid()` vem nulo quando a consulta roda por fora do app.
