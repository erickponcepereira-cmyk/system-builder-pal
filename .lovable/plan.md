# Repaginar sistema de mensalidade

Objetivo: tornar o fluxo de mensalidade previsível, bonito e auditável — tanto para o admin quanto para o assinante (coach, parceiro, profissional).

## 1. Regras de negócio (backend)

- **Adiar = pular o mês:** ao clicar "Adiar/Pular", a fatura atual vira `exempted` (com motivo "Pulada pelo admin"), NÃO gera comissão, NÃO entra em MRR e NÃO bloqueia acesso. A próxima fatura do mês seguinte passa a ser a corrente.
- **Bloqueio automático:** só depois de `due_date + grace_days` do plano. Enquanto pendente dentro da carência, painel liberado. Um job diário promove `pending → overdue → blocked` respeitando a carência.
- **Log de auditoria:** nova tabela `subscription_invoice_audit` (invoice_id, actor_id, action, from_status, to_status, meta jsonb, created_at) alimentada por trigger em toda mudança de status/vencimento/valor e por toda ação admin (pular, isentar, marcar pago, desfazer, adiar data, nova tentativa).
- **Método de pagamento persistido:** garantir que `payment_method` e `wallet_source` sejam sempre gravados em `subscription_invoices` (já existe, revisar consistência) e derivar "método preferido" do usuário do modo mais frequente nos últimos 6 meses.

## 2. Painel do assinante (coach / parceiro / profissional)

Página única "Minha mensalidade" reaproveitada pelos 3 papéis:

- **Cabeçalho:** desde quando é assinante, data de cadastro, dia de vencimento preferido, status atual (Em dia / Pendente / Atrasada / Bloqueada / Isenta).
- **Card "Próxima cobrança":** valor, data, método preferido, botão para trocar preferência.
- **Card "Fatura em aberto":** valor + botões PIX / Cartão / Carteira (mantém integração atual).
- **Histórico:** tabela com Mês, Vencimento, Valor, Status, Pago em, Método, botão "Comprovante PDF".
- **Comprovante PDF:** server function que gera recibo (nome, CPF, valor, mês de referência, método, data de pagamento, número da fatura) via `@react-pdf/renderer` no servidor e devolve o arquivo. Botão de download por linha paga.

## 3. Painel admin — reescrever `admin.subscriptions.tsx`

Layout novo, com 3 abas: **Dashboard**, **Assinantes**, **Faturas** (Configurações vira sub-aba dentro de Dashboard).

### Dashboard (novo)
KPIs do mês corrente: MRR realizado, MRR projetado, inadimplência (R$ e %), churn (canceladas no mês), nº de assinantes ativos, pulados, bloqueados. Gráfico simples de barras dos últimos 6 meses (recebido vs. pendente).

### Assinantes (reescrito)
Tabela por usuário com: Nome, Papel, Cadastro, 1ª fatura, Última paga, **Próxima cobrança**, Método preferido, Status. Filtro por papel, status e busca. Clique abre drawer lateral com timeline completa da conta + ações (isentar por período, alterar dia/valor, cancelar).

### Faturas (reescrito)
- Filtros: mês, status, papel, método, busca.
- Colunas: Mês, Usuário+papel, Vencimento, Valor, Método, Status, Pago em, Ações.
- Ações unificadas num menu (…): **Pular mês** (novo, substitui "Adiar" atual), **Marcar pago (PIX/Cartão/Manual/Carteira)**, **Isentar**, **Reajustar vencimento**, **Nova tentativa**, **Desfazer**.
- Cada linha mostra ícone de "log" que abre o histórico de ações admin daquela fatura (auditoria).

## 4. Como o "adiar do julho pendente" será corrigido

Ao aplicar a nova ação "Pular mês" na fatura pendente de julho da Renata: ela vira `exempted` com motivo, não bloqueia, não conta em inadimplência, e a fatura de agosto (gerada normalmente pelo job mensal) passa a ser a corrente exibida no painel dela.

## Detalhes técnicos

- **Migrações:**
  1. `subscription_invoice_audit` (+ RLS: admin lê tudo; usuário só as próprias) + trigger `log_invoice_change`.
  2. Função `admin_skip_invoice(invoice_id)` — marca `exempted`, grava motivo, registra auditoria.
  3. Ajustar job diário `promote_invoice_statuses()` para respeitar `plan.grace_days` (hoje o promote está muito agressivo).
  4. View `v_user_preferred_payment_method` para o "método preferido" e KPIs.
- **Server functions novas em `admin-subscriptions.functions.ts`:** `skipInvoiceAdmin`, `getInvoiceAuditLog`, `getSubscriptionsDashboard` (KPIs + série 6 meses), `getSubscriberDetail` (timeline por usuário).
- **Server function nova em `subscriptions.functions.ts`:** `getMyBillingOverview` (cabeçalho + próxima + histórico), `downloadInvoiceReceipt` (retorna PDF em base64).
- **Componentes novos:** `SubscriptionDashboard.tsx`, `SubscriberDrawer.tsx`, `InvoiceActionsMenu.tsx`, `InvoiceAuditModal.tsx`, `MyBillingPage.tsx`, `InvoiceReceiptPDF.tsx`.
- **Rota:** unificar as 3 rotas hoje espalhadas (coach/parceiro/profissional) apontando para `MyBillingPage` — mantém as URLs atuais para não quebrar links.
- **Sem alteração** em: motor financeiro (`partnerFinance.ts`), Mercado Pago, carteiras (recalc). Apenas leitura.
