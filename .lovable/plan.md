
## Objetivo

Permitir que você use um conjunto fixo de dados de teste (email/CPF/telefone reservados) para percorrer todo o cadastro do aluno — perfil, mensalidade e anuidade — sem validação de e-mail, sem passar pelo Mercado Pago, sem aparecer em nenhum relatório/lista/rede, e com auto-exclusão ao sair (ou na próxima tentativa com os mesmos dados).

## 1. Credenciais fixas reservadas

Uma tabela nova `test_accounts` guarda os "slots" de teste que você pode reutilizar. Cada slot tem:

- `email` (ex.: `teste1@fitmind.test`, `teste2@fitmind.test`)
- `cpf` de teste
- `telefone` de teste
- `senha_padrao`
- `label` (ex.: "Teste Aluno 1")

Vou pré-popular 3 slots. Qualquer cadastro/login que use um desses e-mails entra no fluxo de teste automaticamente — nenhum toggle global, nenhum botão de admin. Domínio `.test` garante que é impossível confundir com usuário real.

## 2. Bypass de validação de e-mail

- No signup, quando o e-mail pertence a `test_accounts`, o servidor chama a Auth Admin API com `email_confirm: true` (via server function protegida), então o usuário já entra confirmado — sem link no e-mail.
- Não altero a configuração global de auto-confirm; só afeta esses e-mails.

## 3. Bypass de pagamento (mensalidade e anuidade)

- Um server function `simulateTestPayment` detecta que o usuário logado é de teste (flag `is_test = true` no `profiles`/`students`) e, quando ele aperta "Pagar mensalidade" ou "Pagar anuidade":
  - Marca a `subscription`/`annual_activation` como `paid` diretamente.
  - **Não** cria linha em `transactions`, `commissions`, `mercadopago_payments`, `store_orders`, `subscription_invoices` (ou cria com `is_test = true` que é filtrado em toda leitura — ver item 4).
  - **Não** dispara o `handlePaidStoreOrderForActivation` normal nem comissões MLM.
- O frontend do checkout, ao detectar `is_test`, pula o redirect pro Mercado Pago e chama esse endpoint fake — retorno instantâneo "pago".

## 4. Isolamento total nos relatórios

Adiciono coluna `is_test boolean not null default false` nas tabelas que hoje alimentam relatórios/listagens/rede:

- `profiles`, `students`, `coaches` (quando aplicável)
- `subscriptions`, `subscription_invoices`, `user_subscriptions`
- `transactions`, `commissions`, `mercadopago_payments`, `store_orders`, `store_order_items`
- `coach_evaluation_clients`, `coach_network_projections`, `coach_points_log`
- `wallets`, `student_wallets`, `fitcoin_ledger`

E aplico filtro `WHERE is_test = false` (ou `AND is_test IS DISTINCT FROM true`) em:

- Todas as `*.functions.ts` de relatório (`admin-financial`, `admin-reports`, `coach-reports`, `partner-reports`, `admin-network`, `network-ranking`, `top-selling-products`, `financial.functions`, `financialEngine`, `master-commission`, `admin-students`, `coach-downline`, `coach-sales`).
- Listagens de admin (`admin.students`, `admin.coaches`, `admin.orders`, `admin.subscriptions`, `admin.financial-summary`, etc.).
- Painel do coach (downline, rede, alunos, comissões, medalhas, patentes, ranking, projeções).

Regra da casa: qualquer leitura que hoje conta/soma/lista aluno, venda ou comissão passa a excluir `is_test = true`.

## 5. Auto-exclusão

Duas garantias, como você pediu:

**a) Ao clicar em "Sair" com um usuário de teste** — o botão de logout do aluno, ao detectar `is_test`, chama `deleteTestUser` antes do `signOut()`. Essa server function (admin, service role) apaga em cascata:
- linhas em todas as tabelas `is_test = true` daquele `user_id`
- `auth.users` via Auth Admin API

**b) Ao entrar novamente com os mesmos dados** — o server function de signup, se o e-mail já existe em `auth.users` E é um slot de teste, executa a mesma limpeza antes de recriar. Assim, mesmo que você feche o app sem clicar em Sair, o próximo cadastro começa limpo.

Nada de trigger no `auth` schema (proibido); a limpeza é feita por server function chamando a Auth Admin API.

## 6. Segurança

- Toda server function de teste (`simulateTestPayment`, `deleteTestUser`, signup-com-bypass) valida que o e-mail alvo está em `test_accounts`. Se não estiver, rejeita — impossível acionar bypass para conta real.
- `test_accounts` só tem policy de leitura para admin; ninguém consegue "adicionar-se" como conta de teste pelo frontend.
- Domínio `.test` (reservado por IANA) é a segunda barreira: e-mail real nunca cai aqui.

## Detalhes técnicos

- Migrations: nova tabela `test_accounts` + GRANTs + RLS admin-only; coluna `is_test` nas tabelas listadas; índices em `is_test` onde relatórios varrem muitas linhas.
- Servidor: `src/lib/test-accounts.functions.ts` com `simulateTestPayment`, `deleteTestUser`, `signupTestAccount` (todos com `requireSupabaseAuth` exceto o signup, que valida contra a whitelist).
- Frontend: hook `useIsTestUser()` que lê `is_test` do perfil; checkout de mensalidade/anuidade e botão de logout ramificam nesse hook.
- Filtros de relatório aplicados nas server functions de leitura, não no frontend — evita esquecer uma tela.

## Não estou fazendo

- Não mexo em `test_simulated_sales` nem no `test-mode` global do admin — ferramentas diferentes, propósitos diferentes.
- Não crio botão "gerar cadastro fake": você usa os slots fixos.
- Não permito uso dos slots em produção com dado real (validação por domínio `.test` + whitelist).
- Não altero fluxos de pagamento reais nem regras de MLM/comissão — só os pulam quando `is_test`.

Depois que você aprovar, mostro a lista exata de tabelas onde vou adicionar `is_test` e as funções de relatório que vão receber o filtro, para você confirmar antes de rodar a migration.
