## O que já verifiquei no ambiente (agora)

- O agendamento automático existe e está ativo: job `recurring-card-charges`, todo dia às `0 10 * * *` UTC (07:00 BRT), chamando `/api/public/hooks/recurring-charge`.
- O endpoint existe e exige a chave pública no header `apikey`.
- A lógica de cobrança (`chargeDueSubscriptions`) busca assinaturas `active` com `next_charge_at <= hoje`, tenta até 3 vezes (retentativas em 3 e 7 dias) e grava cada tentativa em `recurring_charges`.
- **Estado atual do banco: 0 produtos recorrentes, 0 cartões salvos, 0 assinaturas, 0 cobranças.** Ou seja: nada foi testado ainda e não há dado nenhum para o cron processar — por isso "não acontece nada" hoje.

Conclusão: o encanamento está no lugar, mas o fluxo precisa ser exercitado ponta a ponta com um caso real de teste.

## O que vou implementar para permitir testar

1. **Botão "Cobrar agora" no painel admin de Recorrências** (`RecurringSubscriptionsPanel`): dispara a rotina de cobrança imediatamente para uma assinatura específica, sem esperar o cron das 07h. Mostra o resultado (aprovado/recusado + motivo do Mercado Pago).
2. **Botão "Antecipar vencimento"**: define `next_charge_at` para hoje numa assinatura de teste, para simular que o mês virou.
3. **Aba "Histórico de cobranças"** dentro do painel: lista `recurring_charges` (data, tentativa, valor, status, motivo da recusa), que hoje não é visível em lugar nenhum.
4. Ambos os botões protegidos por verificação de admin no servidor.

## Roteiro de teste que você vai seguir depois

1. Criar um produto de teste com recorrência ativada e valor baixo (ex.: R$ 1,00 mensal).
2. Comprar esse produto com cartão real marcando **"Salvar este cartão"**.
3. Conferir no admin → Recorrências: deve aparecer 1 assinatura `active` com próxima cobrança daqui a 1 mês, e o cartão salvo no perfil do comprador.
4. Clicar em **"Antecipar vencimento"** e depois em **"Cobrar agora"**.
5. Resultado esperado: nova linha em Histórico com status `approved`, próxima cobrança empurrada +1 mês, e o pagamento visível no Mercado Pago.
6. Testar recusa: usar cartão de teste recusado do MP → deve gravar `rejected`, incrementar tentativa e reagendar em 3 dias; após 3 falhas vira `past_due`.
7. Testar cancelamento: aluno desativa o débito automático no perfil → assinatura vai para `canceled` e deixa de ser cobrada.

## Detalhes técnicos

- Novas server functions em `src/lib/recurring.functions.ts`: `adminForceCharge`, `adminSetNextChargeDate`, `adminListCharges` — todas com checagem de role admin via `context.supabase`.
- Reaproveita `chargeOne`/`chargeDueSubscriptions` de `recurring.server.ts` (import dinâmico dentro do handler, sem vazar service role para o bundle do cliente).
- Nenhuma alteração no cron nem no webhook do Mercado Pago.
