## Objetivo

Nova página no admin para rastrear a origem de qualquer aluno: quem indicou, se veio de parceiro, código de indicação usado, coach atual, timestamps e trilha completa até a raiz da indicação.

## Rota nova

- `src/routes/_authenticated/admin.student-trace.tsx` → URL `/admin/student-trace`
- Item novo no `AdminShell.tsx`: **"Rastrear aluno"** (ícone `Search`), na permissão `students`.

## UI

Layout de página única:

1. **Busca no topo** — input único que aceita nome, e-mail, telefone ou código de indicação. Debounce 300ms. Lista até 20 resultados com nome + e-mail + telefone + coach atual. Clicar em um resultado carrega o rastreio.

2. **Painel de rastreio** (após seleção):

   ```text
   ┌─ Aluno ───────────────────────────────────
   │ Nome, e-mail, WhatsApp, cidade
   │ student_id, profile_id, user_id (copiáveis)
   │ Código próprio de indicação
   │ Criado em: <data profile> / <data student>
   │ Status
   ├─ Coach atual ─────────────────────────────
   │ Nome, e-mail, WhatsApp do coach
   ├─ Origem do cadastro ──────────────────────
   │ Tipo: Indicação de aluno | Parceiro |
   │       Importação Fineshape | Lead prévio |
   │       Direto pelo coach | Desconhecida
   │ Detalhes conforme o tipo:
   │   • Aluno indicador: nome, código, coach dele
   │   • Parceiro: nome, código, cidade
   │   • Lead: data, origem (source), código usado
   │   • Import: cliente Fineshape vinculado, data
   ├─ Trilha de indicação ─────────────────────
   │ Lays ← Josiete ← ... ← raiz
   │ (segue referred_by_student_id recursivamente,
   │  máx 20 níveis)
   ├─ Atividade ───────────────────────────────
   │ Última avaliação, última compra, assinatura ativa
   └───────────────────────────────────────────
   ```

3. Botão "Copiar rastreio como texto" (útil para colar em conversas).

## Lógica de detecção da origem

Ordem de prioridade:

1. `students.referred_by_student_id` preenchido → **Indicação de aluno**.
2. `students.partner_id` preenchido e sem indicador aluno → **Parceiro**.
3. `coach_evaluation_clients.student_id = aluno` → veio de **importação Fineshape** (mostra o cliente e o coach).
4. `leads` com mesmo e-mail/telefone anterior ao `profile.created_at` → **Lead prévio** (mostra `source` e `referral_code`).
5. `profile.created_at` ≈ `student.created_at` (<10s) e nenhum dos acima → **Cadastro direto no fluxo do coach** (link direto ou criação manual).
6. Nenhum sinal → **Desconhecida**.

Trilha: enquanto `referred_by_student_id` existir, sobe montando array. Detecta ciclos por `Set` de ids visitados.

## Backend (server function)

Arquivo novo `src/lib/admin-student-trace.functions.ts`:

- `searchStudents({ q })` — busca por nome/e-mail/telefone/código, retorna até 20 (via `context.supabase` autenticado, checa `has_role admin`).
- `traceStudent({ studentId })` — retorna objeto com blocos: `student`, `coach`, `origin` (union discriminada), `referralChain[]`, `activity`.

Ambas com `.middleware([requireSupabaseAuth])` + guarda `has_role(userId, 'admin')`; usam `context.supabase` (RLS). Nenhum uso de service role.

Consultas usadas: `students` + `profiles` + `coaches`, `partners`, `coach_evaluation_clients`, `leads`, `transactions`, `subscriptions`, `coach_body_assessments` (data da última avaliação).

## Permissão

Item de menu com `perm: "students"` (já existente). A tela chama `traceStudent`, que revalida admin no servidor.

## Detalhes técnicos

- Rota sob `_authenticated` (redirect automático já garantido).
- Chama server fn via `useServerFn` — sem loader, evita 401 em prerender.
- Estados de loading/vazio/erro básicos com `toast` do `sonner`.
- Sem alteração de schema, sem migração.

## Arquivos

Novos:
- `src/lib/admin-student-trace.functions.ts`
- `src/routes/_authenticated/admin.student-trace.tsx`

Editados:
- `src/components/admin/AdminShell.tsx` — adiciona item de menu.
