## O que aconteceu com a Amanda

Verifiquei no banco:

- Cadastro criado em 30/07 23:16 como coach comum (`is_professional = false`, `already_coach = false`), corretamente na etapa `awaiting_payment`.
- Ela **não tem nenhum pedido** da Ativação Coach e `activation_paid_at` está vazio.
- No log de auditoria existe **um único evento**: `coach_quiz_approved` em 31/07 02:01, feito por um admin na aba "Liberar Coaches".

Ou seja: o botão **"Aprovar quiz"** foi clicado. Esse botão (`adminApproveQuiz`) move o coach direto para `awaiting_upline_release` **sem checar se a ativação foi paga**. Como a etapa de quiz não é mais obrigatória no fluxo, apertar esse botão hoje significa, na prática, "pular o pagamento". Depois disso ela caiu na tela de "Liberar ID", que também não valida pagamento — e o `unlockCoachWithId` liberaria o painel só com o número do coach.

Não houve bug de cadastro/Google: foi uma porta aberta no painel admin + falta de validação nas etapas seguintes.

## Correções propostas

### 1. Retornar a Amanda para a ativação
Atualizar o registro dela para `onboarding_stage = 'awaiting_payment'`, limpando `quiz_result_submitted_at`/`quiz_result_url` e mantendo `activation_paid_at` nulo. Ela volta a ver a tela de pagamento da Ativação (R$ 179,90) no próximo acesso.

### 2. Blindar o backend (server functions)
- `adminApproveQuiz`: bloquear quando `activation_paid_at` for nulo e `already_coach` for falso — erro claro: "Ativação não paga. Use 'Marcar ativação paga' com justificativa antes de avançar."
- `unlockCoachWithId` (liberação por ID pelo próprio coach): recusar se `activation_paid_at` estiver nulo e não for `already_coach`, devolvendo o coach para `awaiting_payment`.
- `adminAssignCoachIdAndRelease`: mesma checagem, com opção explícita do admin de isentar (aí grava `activation_source = 'admin_grant'` + nota, como já existe hoje).
- `getMyOnboardingStage`: guarda de consistência — se o coach está em `awaiting_quiz_result`/`awaiting_upline_release`, não é `already_coach`, não tem `approved_at` e não tem `activation_paid_at`, volta automaticamente para `awaiting_payment`. Isso conserta qualquer outro caso igual que exista hoje.

### 3. Ajustar o painel admin (`admin.coach-releases`)
- Desabilitar "Aprovar quiz" enquanto a ativação não estiver paga/isenta, com tooltip explicando o motivo.
- Desabilitar "ID + liberar" na mesma condição.
- Manter "Marcar ativação paga" (com justificativa obrigatória) como o único caminho de isenção — ele já registra auditoria.

### 4. Varredura
Rodar uma checagem para listar qualquer outro coach em etapa avançada sem ativação paga e sem isenção registrada, e devolvê-los para `awaiting_payment` (hoje, pela consulta que fiz, só a Amanda está nessa condição; a regra do item 2 cobre os futuros).

## Detalhes técnicos
- Arquivos: `src/lib/coach-onboarding.functions.ts` (validações), `src/routes/_authenticated/admin.coach-releases.tsx` (botões condicionais).
- Ajuste de dados da Amanda e a varredura via operação de dados (não migração de schema).
- Sem mudança de schema; nenhuma alteração no fluxo de profissional/parceiro (`awaiting_admin`) além da guarda de consistência, que ignora quem tem `approved_at` ou isenção registrada.
