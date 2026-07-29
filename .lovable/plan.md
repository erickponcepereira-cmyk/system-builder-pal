## Objetivo

Garantir que uma venda que ficou "pendente" no Mercado Pago e depois foi aprovada gere a comissão do coach mesmo que o webhook não chegue — sem depender de alguém clicar em "reconciliar" no admin.

## Como funciona hoje (verificado no código)

- `src/routes/api.public.mp.webhook.ts`: o MP reenvia notificação quando o status muda. Ao virar `approved`, o webhook busca o pagamento na API do MP, valida `source_kind`, existência do pedido e o valor (tolerância R$ 0,05) e chama `applyApproval(kind, sourceId)` — é esse passo que grava as comissões. Idempotente: se o registro local já está `approved`, não reprocessa.
- `src/lib/mp-reconcile.functions.ts`: `listPendingMpPayments` (pendentes/in_process há mais de 5 min) e `reconcileMpPayment` (consulta o MP e aplica) — **manuais**, exigem um admin logado.
- `src/lib/admin-reconcile.functions.ts`: `reconcileApprovedPendingPayments` varre pagamentos aprovados cuja origem continua pendente — também manual.

Lacunas: (a) nada roda sozinho; (b) `reconcileMpPayment` só aplica aprovação para `store_order`, `transaction` e `partner_product_order` — `subscription_invoice` fica de fora, ao contrário do webhook.

## O que fazer

### 1. Rota pública de varredura (cron)

Nova rota `src/routes/api/public/hooks/mp-sweep.ts`, no mesmo padrão das rotas de hooks já existentes:

- `POST`, protegida por segredo no header (comparação timing-safe), igual às outras rotas de hook do projeto.
- Busca em `mercadopago_payments` os registros com status `pending`/`in_process` criados nos últimos 7 dias (limite ~200, mais antigos primeiro).
- Para cada um: consulta a API do MP (`getPayment`), atualiza status local e, se estiver aprovado, chama `applyApproval` — reaproveitando exatamente o mesmo caminho do webhook, com a mesma checagem de idempotência (não reaplica se a origem já está paga).
- Em seguida, executa a mesma varredura de `reconcileApprovedPendingPayments`: aprovados no MP cuja origem continua pendente.
- Retorna um resumo (`verificados`, `aprovados`, `aplicados`, `falhas`) e registra falhas no log, uma a uma, sem abortar o lote.

### 2. Agendar

Agendar a rota via `pg_cron` (mesmo mecanismo já usado pela cobrança recorrente), a cada 15 minutos, apontando para a URL estável de produção.

### 3. Corrigir a assimetria do reconcile manual

Em `reconcileMpPayment`, incluir `subscription_invoice` na lista de tipos que disparam `applyApproval`, igualando ao webhook.

### 4. Visibilidade no admin

No painel de pagamentos, mostrar a data/resultado da última varredura automática, para não parecer que "não aconteceu nada".

## Restrições

- **Nenhuma alteração** em `src/server/mercadopago.server.ts`, `src/lib/mercadopago-impl.server.ts` ou no webhook. A varredura apenas reutiliza `getPayment` e `applyApproval`.
- Nenhuma mudança em cálculo ou valor de comissão.
- Sem `EXCEPTION WHEN OTHERS THEN NULL`: toda falha é logada com o id do pagamento.

## Aceite

- Um pagamento aprovado no MP com webhook perdido é processado em no máximo 15 minutos e gera a comissão.
- Rodar a varredura duas vezes seguidas não duplica comissão.
- A invariante das carteiras continua zerada.
