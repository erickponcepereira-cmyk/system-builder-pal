
## Fluxo Coach pendente (após cadastro)

Estados do coach (campo novo em `coaches.onboarding_stage`):
1. `awaiting_payment` — acabou de se cadastrar (com ou sem link de venda)
2. `awaiting_quiz_result` — pagou o curso "Ativação Coach - Anual"
3. `awaiting_upline_release` — colou o link do resultado do quiz
4. `released` — admin liberou (libera painel coach + app aluno)

### 1. Banco
Migration adicionando em `coaches`:
- `onboarding_stage` text default `'awaiting_payment'`
- `quiz_result_url` text
- `quiz_result_submitted_at` timestamptz
- `activation_paid_at` timestamptz
- `activation_order_id` uuid

### 2. Cadastro (`registration.server.ts`)
- Coach já entra com `status=pending` e `approved_at=null` (já funciona).
- Setar `onboarding_stage='awaiting_payment'`.
- Manter criação do registro de aluno (acesso só ao bloqueio).

### 3. Bloqueio do app — novo componente `CoachOnboardingGate`
Wrap em `src/routes/student.tsx` e `src/routes/coach.tsx`. Se o profile logado é coach com `onboarding_stage != 'released'`, renderiza tela única (não deixa entrar em mais nada):

- **Stage `awaiting_payment`**: tela "Faça o curso de Formação de Coachs e inicie sua trajetória conosco" + CTA grande abrindo checkout direto do produto "Ativação Coach - Anual" (uso do `MercadoPagoCheckout` existente). Nenhuma outra navegação.
- **Stage `awaiting_quiz_result`**: tela com link `https://diagnostic-quiz-craft.lovable.app` (botão "Abrir quiz") + campo "Cole aqui o link do resultado" + botão Enviar. Validar que começa com `https://diagnostic-quiz-craft.lovable.app/`.
- **Stage `awaiting_upline_release`**: tela "Tudo pronto! Quando terminar o curso, peça ao coach que te trouxe para liberar seu painel" + botão "Notificar meu coach indicador" (cria notification para upline e admin).
- **Stage `released`**: gate não renderiza, app normal.

### 4. Server functions novas (`src/lib/coach-onboarding.functions.ts`)
- `getMyOnboardingStage()` — usa `requireSupabaseAuth`, retorna stage + dados.
- `submitQuizResult({url})` — valida domínio, salva, avança para `awaiting_upline_release`, cria notification para upline + admin.
- `notifyUplineForRelease()` — botão "lembrar upline".
- `releaseCoach({coachId})` — admin-only, marca `released`, seta `approved_at`, `profiles.status='active'`.

### 5. Trigger de pagamento
No webhook do Mercado Pago / fulfillment de pedido (procurar `partner-orders` / `orderpool`), quando o pedido pago contém produto "Ativação Coach - Anual" para um coach com `onboarding_stage='awaiting_payment'`:
- Atualizar `onboarding_stage='awaiting_quiz_result'`, gravar `activation_paid_at`, `activation_order_id`.

### 6. Painel admin
Nova aba (ou card em `admin.coach-applications.tsx`): lista coaches com `onboarding_stage='awaiting_upline_release'` mostrando o link do quiz colado + botão "Liberar painel". Notificação criada para upline + admin quando coach colou o link.

### 7. Link de venda (`/r/{code}`)
Já existe `src/routes/r.$code.tsx`. Garantir que ao cadastrar via esse link o `uplineCoachId` é setado automaticamente e o seletor de coach é skipado (ou pré-selecionado e travado). Verificar implementação atual e ajustar se necessário.

### Fora do escopo
- Não vou mexer no fluxo de aluno comum.
- Não vou criar produto "Ativação Coach - Anual" — assumir que existe (admin cadastra). Se não existir, o gate mostra mensagem "Curso indisponível, contate o admin".
