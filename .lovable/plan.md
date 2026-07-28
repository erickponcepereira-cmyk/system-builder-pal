## Diagnóstico

Luana Daubian (`daubianluana@gmail.com`, coach) fez o pagamento da **Adesão Anual** (R$ 179,90) e ele **foi aprovado** no Mercado Pago:

- `mp_payment_id` **170851036588** → `status = approved`, `paid_at = 2026-07-28 01:02:12`
- `external_reference` = `store_order:b0d079b0-f028-414f-9eaf-4c413c0fb3f8`

Mas o **pedido correspondente ficou como `pending`**:

- `store_orders.b0d079b0…` → `status = pending`, sem `paid_at`, sem processamento

Ou seja, o webhook atualizou o registro em `mercadopago_payments`, mas a rotina `applyApproval('store_order', …)` não concluiu o processamento — por isso a anuidade dela nunca virou "Ativa (paga)" na tela, e o card continuou oferecendo pagamento. As 3 tentativas rejeitadas anteriores são normais (retries de PIX/cartão), o problema é só na aprovação final que não foi materializada.

A tela em branco do Safari ("não pôde estabelecer conexão segura") é um problema **separado**, de TLS/DNS no iPhone específico dela (mesmo em outra rede) — não é causa do não-avanço da anuidade e não se resolve por código do app. Trataremos isso apenas com orientação (`/diagnostico?sw=off`, Ajustes → Safari → Limpar histórico e dados, teste em outro Wi‑Fi/4G). A anuidade só aparecerá "Ativa" quando ela conseguir abrir o site.

## O que vou fazer

### 1. Reconciliar o pagamento da Luana agora (via migração)
Aplicar manualmente o que o webhook deveria ter feito para o `mp_payment_id 170851036588` / `store_order b0d079b0…`:

- Marcar `store_orders.status = 'paid'`, `paid_at = <paid_at do MP>`, `mp_payment_id`, `payment_method`.
- Rodar a lógica de aprovação do pedido de ativação (o mesmo caminho de `applyApproval` para `store_order`), para que a **anuidade da Luana** fique registrada como ativa (`assinatura anual` / `subscriptions` + qualquer contador que `getMyAnnualActivation` consulte).
- Verificar via SELECT que `getMyAnnualActivation` para a Luana passará a retornar `active = true`.

### 2. Reprocessar aprovados órfãos e evitar reincidência
Publicar uma função `reconcilePendingApprovedPayments` (server function admin + rota `/api/public/hooks/reconcile-approved` autenticada por segredo) que:

- Busca em `mercadopago_payments` linhas com `status='approved'` cuja `source` (store_order / subscription_invoice / partner_product_order / transaction) ainda esteja `pending` há mais de 2 minutos.
- Para cada uma, chama `applyApproval(kind, sourceId)` com try/catch, gravando erro em log.
- Fica disponível para o admin executar manualmente (botão em Admin → Pagamentos → "Reconciliar aprovados pendentes") e, opcionalmente, ser chamada por cron (fora do escopo desta iteração — deixaremos a rota pronta).

### 3. Auto-refresh do card de anuidade
No `AnnualActivationCard`, quando o `MercadoPagoCheckout` chama `onApproved`, além de recarregar, disparar uma reconciliação silenciosa do último `mp_payment_id` conhecido daquela sessão de checkout, para o caso do webhook demorar/falhar. Isso garante que a tela sai de "não ativa" mesmo se o webhook não chegou.

### 4. Comunicação para a Luana (sem código)
Depois da reconciliação, avisar que:
- A anuidade dela **já está ativa** no cadastro.
- Para o erro do Safari no iPhone, pedir para abrir `https://fitmindclub.com.br/diagnostico?sw=off` no Safari; se persistir, testar em outra rede (4G) e em Ajustes → Safari → Limpar histórico e dados; se ainda assim falhar, é o dispositivo/rede dela, não o app.

## Fora de escopo

- Investigar/corrigir o motivo raiz do webhook não ter aplicado (pode ser timeout de assinatura, erro dentro de `applyApproval`, ou o webhook chegou antes do `paid_at` ser propagado). A reconciliação automática do item 2 blinda o usuário independentemente da causa; um mergulho no bug do webhook fica para uma próxima iteração se voltar a acontecer com frequência.
- Alterar o domínio ou configuração TLS — o site está no ar e responde em outros dispositivos.

## Detalhes técnicos

- Migração SQL:
  - `UPDATE store_orders SET status='paid', paid_at='2026-07-28 01:02:12+00', mp_payment_id='170851036588', payment_method='pix' WHERE id='b0d079b0-f028-414f-9eaf-4c413c0fb3f8' AND status='pending';`
  - Chamar as funções PL/pgSQL que `applyApproval('store_order', …)` invoca hoje (grant de anuidade + eventuais splits/cofres). Se existir uma função única `apply_store_order_paid(_order_id uuid)`, invocá-la; caso contrário replicar em SQL o mesmo efeito do caminho TypeScript (marcar assinatura anual do usuário, disparar `ensure_user_subscription` se necessário).
- Novo arquivo `src/lib/admin-reconcile.functions.ts`:
  - `reconcileAllApprovedPending()` — admin-only, lista candidatos e reprocessa; retorna resumo `{ processed, failed, details[] }`.
- UI em `src/routes/_authenticated/admin.payments.tsx`: botão "Reconciliar aprovados pendentes" com toast do resumo.
- `src/components/profile/AnnualActivationCard.tsx`: em `onApproved`, chamar `reconcileMpPayment` (já existe) passando o `mp_payment_id` retornado pelo checkout, depois `load()`.
