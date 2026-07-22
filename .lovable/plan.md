
## Diagnóstico (confirmado no banco)

Consultei `mercadopago_payments` para os e‑mails da Luana. A fatura de mensalidade (`63ce91d2-51de-4505-855f-8a822889e89f`, R$ 100) tem **5 tentativas de cartão** entre 21/07 e 22/07, todas com `status=rejected` e `status_detail=cc_rejected_high_risk`. No mesmo período, outra tentativa dela em `store_orders` com o mesmo cartão também caiu em `cc_rejected_high_risk`, e apenas 1 store_order foi aprovada (valor menor / contexto diferente).

`cc_rejected_high_risk` é uma decisão **antifraude do Mercado Pago sobre aquele cartão + perfil de compra** — não é bug do nosso código. Nenhuma retentativa com o mesmo cartão vai passar; MP recomenda outro meio (PIX, outro cartão) ou revisão pelo próprio portador com o banco emissor.

O código já usa idempotency key única por tentativa, já limpa `mp_payment_id` da fatura em status rejeitado e já mostra a mensagem amigável. O que falta é (a) reduzir o score de risco enviando dados completos do pagador (hoje só mandamos `email` na init do Brick — nem nome nem CPF), (b) oferecer o caminho de escape com clareza no primeiro high_risk, e (c) dar ao admin uma ação de "marcar como paga manualmente" pra desbloquear a Luana agora sem esperar cartão novo.

## Mudanças

### 1. Enviar payer completo pro Brick de cartão (`src/components/payments/MercadoPagoCheckout.tsx`)
Passar `payer: { email, firstName, lastName, identification: { type: "CPF", number } }` na `initialization` do Brick quando tivermos nome/CPF. Isso melhora o score antifraude em faturas de mensalidade (hoje a `SubscriptionInvoicesTab` já busca `state.payer` mas o componente descarta nome/doc na init).

### 2. Fallback automático pra PIX após high_risk (`MercadoPagoCheckout.tsx`)
Quando `statusDetail === "cc_rejected_high_risk"`, além do botão "Tentar cartão novamente" mostrar um botão primário "Pagar com PIX" que faz `setTab("pix")`. Texto explicativo curto: "O cartão foi recusado pela análise de risco do Mercado Pago. PIX costuma aprovar na hora."

### 3. Ação admin "Marcar fatura como paga manualmente" (`admin.subscriptions.tsx` + `src/lib/admin-subscriptions.functions.ts`)
Novo server fn `adminMarkInvoicePaidManual({ invoice_id, method: 'manual_admin', note })` que chama a mesma RPC `process_subscription_invoice_payment` com `_method='manual_admin'`, `_wallet_source='external'`, `_fee_amount=0`, `_performed_by=<admin uid>`. Botão discreto na linha da fatura (ao lado de "Pular mês"), com confirmação e campo de observação, gravado no `subscription_invoice_audit`.

### 4. Desbloqueio pontual da Luana
Registrar a fatura `63ce91d2-51de-4505-855f-8a822889e89f` como paga manualmente (método `manual_admin`, observação "Cartão bloqueado por antifraude MP — pagamento acordado fora do app"), executando o mesmo RPC via `supabase--migration`. Assim ela sai do bloqueio hoje sem depender de novo cartão.

## Fora do escopo

- Não vamos tentar "burlar" o high_risk mudando idempotency, CPF fake, ou trocando conta MP — a rejeição é do adquirente sobre o cartão dela.
- Não muda taxas, RLS, nem lógica de carteira.

## Detalhes técnicos

- Nome dividido em `firstName`/`lastName` com `payer.name.split(" ")` (primeiro token e resto), CPF só dígitos.
- `adminMarkInvoicePaidManual` reutiliza `process_subscription_invoice_payment` já existente; nada de nova RPC.
- A limpeza da fatura para nova tentativa PIX já funciona (validei em `handleCreatePix` + `clearRejectedSourcePointer`).
