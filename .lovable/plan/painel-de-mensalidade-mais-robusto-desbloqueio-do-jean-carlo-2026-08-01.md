# Painel de mensalidade mais robusto + desbloqueio do Jean Carlos

## O que aconteceu com o Jean Carlos

Verifiquei a conta dele (reismuaythai17@gmail.com, coach ativo):

- Assinatura: **ativa**, R$ 100,00, vencimento dia 5.
- Faturas: **agosto/2026 = Isenta** (foi a que você isentou hoje), mas **junho/2026 e julho/2026 continuam com status "Bloqueada"**.

A regra de bloqueio do sistema considera o usuário bloqueado se existir **qualquer** fatura bloqueada, de qualquer mês. Como você isentou só a fatura do mês atual, as duas antigas continuaram travando o painel. Não é bug de tela: é falta de uma ação que resolva o histórico inteiro de uma vez.

## Correções e melhorias

### 1. Regularizar o Jean (imediato)
Isentar as faturas de junho e julho dele, o que libera o painel na hora.

### 2. Ação "Liberar acesso agora" por usuário
Botão no card de cada assinante que, em um clique, isenta/quita **todas** as faturas bloqueadas e atrasadas daquele usuário e libera o painel — com registro no log de auditoria (quem liberou, quando e por quê).

### 3. Isenção com efeito real na assinatura
Ao marcar a assinatura como Isenta (mês / ano / permanente), o sistema também deixa de manter faturas bloqueadas no período isento, em vez de exigir tratar fatura por fatura.

### 4. Painel de mensalidade mais completo
No admin de mensalidades:
- Aviso destacado em cada assinante bloqueado com **quantas faturas** e **quais meses** estão travando o acesso, e a soma em aberto.
- Filtros por situação (Bloqueados, Atrasados, Em dia, Isentos) e busca por nome/e-mail/CPF.
- Por assinante: data de cadastro, primeira fatura, última paga, próxima fatura, forma de pagamento preferida, total pago e total em aberto.
- Ações em lote nas faturas selecionadas de um assinante: marcar pago, isentar, pular mês, reabrir e reagendar vencimento.
- Histórico de auditoria visível direto no card (últimas ações realizadas).
- Garantir que faturas antigas apareçam sempre (hoje a listagem pode esconder registros mais antigos por causa do filtro de período/limite).

## Detalhes técnicos

- Dados: `UPDATE subscription_invoices SET status='exempted'` nas faturas `e8e3cba7…` (jul) e `c54ebd56…` (jun) do usuário `44fd57da…`.
- Nova função de banco `admin_release_user_subscription(_user_id, _reason)`: isenta todas as faturas `blocked`/`overdue` do usuário e grava em `subscription_invoice_audit`. Exposta via novo server fn em `src/lib/admin-subscriptions.functions.ts` com `assertAdmin`.
- `updateSubscriptionAdmin`: ao definir status `exempt_*`, aplicar isenção às faturas em aberto dentro do período de isenção.
- `listAdminInvoices`: remover o teto de 500 quando um usuário específico é aberto e trazer todo o histórico do assinante; manter o filtro de período apenas na visão geral.
- `admin.subscriptions.tsx`: filtros de situação, resumo por assinante, seleção múltipla de faturas, badge de meses bloqueando e painel de auditoria inline.
- `is_user_blocked_by_subscription` permanece como está (qualquer fatura `blocked` bloqueia) — a correção é dar ao admin a ação que limpa todas.
