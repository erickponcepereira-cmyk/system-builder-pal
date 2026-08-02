# Correção dos 3 problemas: horários, erro na venda e reset de pontos

## 1. Horário errado na agenda (caso Helton)

Diagnóstico confirmado no banco: a disponibilidade do Helton é sexta-feira das **14:00 às 17:00** (blocos de 30 min), com 14:00 e 15:00 já ocupados no dia 07/08. Mesmo assim a tela mostrou 13:30, 14:30, 15:00 e 15:30 — exatamente os mesmos horários deslocados em 1 hora.

Causa: as funções de agenda do banco calculam tudo no fuso `America/Sao_Paulo` (UTC-3), enquanto o app inteiro usa `America/Cuiaba` (UTC-4, definido em `src/lib/timezone.ts`). Todo horário sai 1 hora fora.

Correção: trocar o fuso para `America/Cuiaba` nas 6 funções do banco que ainda usam São Paulo:
`list_professional_available_slots`, `list_partner_freebie_slots`, `my_freebie_usage`, `reserve_partner_freebie`, `redeem_partner_freebie`, `partner_redeem_coupon`.

## 2. Erro ao vender ("best candidate function")

Existem duas versões da mesma função no banco:

```text
create_scheduled_professional_order(uuid, timestamptz, text, uuid)
create_scheduled_professional_order(uuid, timestamptz, text, uuid, uuid)
```

Quando a tela envia 4 parâmetros nomeados, o Postgres não consegue decidir qual usar e a venda falha. A versão de 5 parâmetros (com `_referred_by_student_id`) já cobre todos os casos, pois o parâmetro extra tem valor padrão.

Correção: remover a versão antiga de 4 parâmetros. Todas as telas que chamam a função (loja do aluno, loja de parceiro/profissional) continuam funcionando sem alteração.

## 3. Reset de pontos acontecendo um dia antes

A apuração mensal usa limites de mês em **UTC** (`monthBounds` em `src/lib/network-unlock.server.ts`) e o mês corrente é lido do relógio do servidor (UTC). Como Cuiabá é UTC-4, o "mês novo" começa às 20:00 do dia 31 — por isso os pontos zeraram ontem.

Correção nos arquivos:
- `src/lib/network-unlock.server.ts` — `monthBounds` passa a usar o início do mês no fuso de Cuiabá (UTC-4).
- `src/lib/network-unlock.functions.ts` — mês/ano correntes e as chaves de mês passam a usar os helpers de fuso em vez de `getUTCMonth()`.
- `src/lib/coach-medals.functions.ts` — mesma correção de mês corrente.

Efeito: a virada de mês (e o reset dos pontos) passa a ocorrer à meia-noite no horário local, nunca antes.

## Detalhes técnicos

- Uma migração única: laço `CREATE OR REPLACE` reaplicando as funções com `America/Cuiaba` + `DROP FUNCTION` da sobrecarga de 4 argumentos.
- Nenhuma mudança de esquema, RLS ou dados; apenas definições de função e cálculo de datas no frontend/servidor.
