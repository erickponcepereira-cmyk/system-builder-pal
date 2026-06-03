## Escopo

Quatro frentes que se conectam. Apresento cada uma com o que vou fazer e onde preciso de confirmação.

---

### 1. Remover o bloco antigo "Indicação aluno → aluno"

Esse bloco (primeiro print) hoje vive em **dois lugares duplicados**: `src/components/admin/ProductFinancialEditor.tsx` e `src/routes/admin.products.tsx` (linhas ~599 e ~709). Ele controla `product_referral_rules` — uma regra fixa por produto (taxa fixa + % aluno + % pool coach).

**Vou:**
- Remover o card do toggle e os campos relacionados nos dois arquivos.
- Manter a tabela `product_referral_rules` por enquanto (não dropar) — só esconder da UI. Se já tiver dados, ficam ociosos até confirmarmos drop.
- Passar a usar **apenas o sistema de slots** (segundo print), com a checkbox **"Indicação"** marcada por slot — que já existe (`applies_to_student_referral` em `product_value_slots`).

---

### 2. Link próprio de indicação por aluno + fluxo de cadastro→compra

**Como funciona hoje:** aluno tem `referral_code` (rota `/r/$code` já existe e leva para cadastro com coach pré-vinculado).

**O que vou adicionar:**
- **Apenas produtos com pelo menos um slot com "Indicação" marcada** geram link de indicação para alunos.
- Novo formato de URL: `/r/{referral_code}/p/{product_id}` (ou `/r/{referral_code}?p={product_id}`).
  - Se o visitante **não tiver conta** → vai pra cadastro de aluno, herda o coach do aluno indicador, e ao concluir cai direto na tela de compra do produto (`/student/store` no produto).
  - Se **já tiver conta** → vai direto pra compra desse produto.
- Aluno indicador fica gravado na venda (campo novo `referrer_student_id` em `store_orders`).
- No card do produto na loja do aluno e na carteirinha aparece um botão **"Copiar link de indicação"** quando o produto for indicável.
- Comissão do indicador é distribuída pelos slots `applies_to_student_referral=true` — motor já existe em `calculateReferralDistribution` (`financialEngine.ts`), só vou migrar pra ler slots ao invés de `ReferralRule`.

**Decisão que preciso confirmar:** quando a venda for por indicação, devo **substituir** a distribuição da venda normal pela dos slots de indicação, ou **somar** o slot do indicador por cima da venda normal? Pelos prints (e pelo design atual de "venda normal" vs "indicação" serem mutuamente exclusivas nos slots), vou assumir **substituir**: venda com `referrer_student_id` usa só slots de indicação.

---

### 3. Nova aba "ALUNOS INDICADORES" no Financeiro Admin

Mesma forma dos cards atuais (terceiro print: Coaches a pagar, Rede, Nutricionistas, Sistema):

- Novo card "ALUNOS (INDICAÇÃO)" com totais **Pendente / Disponível / Pago**.
- Drill-in mostrando cada aluno indicador, valor a liberar, lista de vendas que originaram, botão de marcar como pago (igual fluxo dos coaches).
- Reaproveita `student_wallets` (já existe) — só preciso garantir que a entrada da comissão de indicação cai lá no momento do `paid` do MP.
- Aparece no relatório financeiro pra dar baixa.

---

### 4. Bug: venda de R$100 não caiu no financeiro

Investiguei o banco:

```text
store_orders.id 9fabfe98… status=pending, total=100, created 02/06 14:25
mercadopago_payments.id 09dd9fab… mp_payment_id=162149996496, status=pending
```

A `store_order` e o `mercadopago_payments` continuam **pending** mesmo com pagamento feito → o **webhook do Mercado Pago não foi processado** (ou chegou e falhou ao atualizar). Por isso a `transaction` da venda nunca foi criada e nada aparece no financeiro.

**Vou:**
- Conferir `src/routes/api.public.mp.webhook.ts`: log de erro, idempotência, mapeamento `source_kind=store_order`.
- Conferir se o `notification_url` enviado ao criar o pagamento PIX está apontando para a URL pública certa.
- Adicionar reconciliação: um endpoint admin **"Reconciliar pagamento MP"** que consulta a API do MP por `mp_payment_id` e atualiza status, paid_at, dispara o pós-processamento. Disparar pra esse pagamento R$100 específico depois pra ele cair no financeiro.

---

## Arquivos que vou editar

| Arquivo | Mudança |
|---|---|
| `src/components/admin/ProductFinancialEditor.tsx` | Remover bloco "Indicação aluno → aluno" |
| `src/routes/admin.products.tsx` | Idem (duplicado) |
| `src/lib/financialEngine.ts` | `calculateReferralDistribution` lê slots `applies_to_student_referral` |
| `src/routes/r.$code.tsx` | Aceitar `?p={product_id}` e redirecionar pós-cadastro |
| `src/components/student/StorePage.tsx` + carteirinha | Botão "copiar link de indicação" em produtos indicáveis |
| `src/lib/admin-financial.functions.ts` | Novo bucket "alunos indicadores" |
| `src/routes/admin.financeiro.tsx` | Novo card + drill-in |
| `src/routes/api.public.mp.webhook.ts` | Logs + correção do processamento |
| Nova `src/lib/mp-reconcile.functions.ts` | Endpoint admin de reconciliação |

## Migração de DB

- `store_orders.referrer_student_id uuid null` (FK students).
- `transactions.referrer_student_id uuid null` (idem).
- Nenhuma tabela nova; uso `student_wallets` que já existe.

---

## Quero confirmar antes de começar

1. **Substituir vs somar** na pergunta da seção 2 — confirma que venda por indicação usa **apenas** os slots de indicação?
2. Posso **manter** a tabela `product_referral_rules` (sem usar) ou prefere que eu derrube ela e os campos relacionados de uma vez?
3. Para o bug do R$100, depois de corrigir o webhook eu **reconcilio aquele pagamento específico** automaticamente, ok?
