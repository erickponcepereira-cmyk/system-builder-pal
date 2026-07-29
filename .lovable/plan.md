## Problema 1 — "Something went wrong" ao entrar em Coach / Parceiro / Profissional

**Causa confirmada:** os componentes novos do sistema de recorrência usam TanStack Query (`useQuery`/`useMutation`/`useQueryClient`), mas o app **nunca teve um `QueryClientProvider` montado** — não existe nenhum no projeto. Assim que o componente entra em tela, ele lança o erro "No QueryClient set" e a tela de erro do router aparece.

Arquivos que quebram hoje:
- `src/components/profile/AutoDebitCard.tsx` (renderizado por `SubscriptionInvoicesTab` → `SubscriptionGuard`, que é usado por coach.tsx, partner.tsx e professional.tsx — por isso Aluno não quebra)
- `src/components/admin/RecurringSubscriptionsPanel.tsx` (aba Recorrências do admin)
- `src/routes/_authenticated/student.downloads.tsx` (aba de arquivos do aluno)

**Correção:**
1. Criar o `QueryClient` dentro da fábrica do router (`src/router.tsx`) e expor no contexto, e envolver o `<Outlet />` do `src/routes/__root.tsx` com `<QueryClientProvider>` — assim todo o app passa a ter Query disponível, sem mexer na lógica de negócio.
2. Endurecer o `defaultErrorComponent` em `src/router.tsx` para mostrar a mensagem real do erro (e um botão "Copiar detalhes"), de modo que uma próxima quebra apareça identificada em vez de "Something went wrong".
3. Validar abrindo os painéis Coach, Parceiro, Profissional, Admin → Recorrências e Aluno → Arquivos, conferindo o console sem exceções.

## Problema 2 — Venda sem comissão para quem vendeu (carteira da Vitória)

**Causa confirmada no banco:** a função `process_paid_transaction` define o "vendedor" como `students.coach_id` do comprador. Quando o próprio coach compra (auto-compra), o registro de aluno dele aponta para o **upline**, não para ele. Resultado: a "Comissão do Vendedor" e os níveis 1/2/3 sobem um degrau.

Escala: de 75 alunos que também são coaches, **74** estão com o `coach_id` apontando para o upline. A venda de R$ 179,90 da Vitória (06/07) pagou o vendedor ao Erick e nada a ela.

**Correção:**
1. Ajustar `process_paid_transaction`: se o perfil do comprador possui registro de coach aprovado, esse coach passa a ser o vendedor (`coach_row`), e a rede L1/L2/L3 passa a ser calculada a partir dos uplines **dele** — mantendo o comportamento atual para alunos comuns.
2. Ajustar `ensure_self_student_for_coach` para que o aluno-espelho de um coach aponte para o próprio coach, sem alterar vínculos de alunos reais.
3. Corrigir os dados existentes: reprocessar apenas as transações pagas de auto-compra de coaches (recriando comissões via o próprio fluxo já usado no reprocessamento), começando pela venda da Vitória, e rodar a reconciliação de carteiras.
4. Conferir no painel: carteira da Vitória com a comissão da venda de R$ 179,90 e o total de "Coaches a pagar" no admin batendo com as carteiras.

## Detalhes técnicos

- Provider: `QueryClient` criado por request na fábrica do router (evita vazamento de cache entre requisições no SSR), `defaultPreloadStaleTime: 0`.
- Nenhuma mudança visual nos painéis além da tela de erro mais informativa.
- Alterações no banco entram como migração (funções `process_paid_transaction` e `ensure_self_student_for_coach`); a correção de linhas históricas é feita como operação de dados, não migração.
