## Escopo

Quatro entregas independentes no admin/auth, sem quebrar fluxos existentes.

---

### 1. Admin: liberar aluno manualmente (confirmar e-mail)

Já existe `admin_network--confirmAuthEmailByProfileId` server function que usa `auth.admin.updateUserById({ email_confirm: true })`. Falta expor no UI.

- Em `admin.students.tsx` adicionar botão **"Confirmar e‑mail manualmente"** em cada linha/modal do aluno, chamando essa função.
- Toast de sucesso/erro. Só habilitado se `email_confirmed_at` estiver nulo (ler via server fn nova `getAuthEmailStatus`).
- Mesmo botão em `admin.coaches.tsx`, `admin.partners.tsx`, `admin.professionals.tsx` (o gate é o mesmo problema).

---

### 2. Corrigir Reset de Senha / Confirmar E-mail após troca de domínio

**Causa provável:** o Supabase Auth **Site URL** ficou apontando para `fitmindclub.lovable.app` (ou lovable.app antigo). Como e-mails de reset/confirm usam Site URL + `redirectTo`, e `redirectTo` só é honrado se estiver na allow‑list, os links quebram no domínio novo `fitmindclub.com.br`.

- Adicionar `https://fitmindclub.com.br` e `https://www.fitmindclub.com.br` à allow‑list de Redirect URLs no Supabase (via Lovable Cloud → Users → Auth Settings — não é ajustável por migration/código do lado do app).
- No código: garantir que `emailRedirectTo` e `redirectTo` em `createAuthUser.ts`, `CheckEmailNotice.tsx` e `login.tsx` continuem usando `window.location.origin` (já usam) — isso está OK, o problema é a allow‑list.
- Documentar/instruir o usuário a fazer o ajuste. Pergunta: você quer que eu tente configurar isso via `supabase--configure_auth` ou você mesmo ajusta em Cloud → Users → Auth Settings?

---

### 3. Cadastro / Login com Google (com deduplicação)

- Ativar provider Google gerenciado (`supabase--configure_social_auth` com `providers: ["google"]`, mantendo email).
- Instalar/reusar `@lovable.dev/cloud-auth-js` (`lovable.auth.signInWithOAuth`).
- Botão "Continuar com Google" em `login.tsx` e nas telas de registro (`StudentRegistration`, `CoachRegistration`, `PartnerRegistration`, `ProfessionalRegistration`).
- Redirect: `${window.location.origin}/onboarding` (rota nova/reaproveitada) que decide:
  - **Se e‑mail do Google já existe em `profiles`** → apenas loga (vincula identidade Google à conta existente automaticamente pelo Supabase, mesmo e-mail = mesmo usuário).
  - **Se é aluno novo** → tela `onboarding.tsx` (já existe) exige **telefone, sexo e data de nascimento** antes de criar `profiles`/`students`.
  - Para novos coach/partner/profissional via Google → redireciona para as respectivas telas de registro pré‑preenchidas com nome/email do Google, exigindo os demais dados/pagamento normalmente.
- Deduplicação extra: usar `checkEmailAvailable` antes de criar profile; se existir profile com mesmo email sem `user_id`, fazer merge (setar `user_id`). Trigger idempotente.

---

### 4. Admin: aba "Links de Indicação"

Nova rota `admin.referral-links.tsx` + entrada no `AdminShell.tsx`.

- Lista unificada de todos referral codes (`coaches.referral_code`, `partners.referral_code`, `students.referral_code`), com colunas: Nome, Papel, Código, Link completo (`/r/CODE`), botão Copiar.
- Filtros: busca por nome/código, filtro por papel.
- Server fn `listAllReferralLinks` (admin‑only) em novo `src/lib/admin-referral-links.functions.ts`.

---

## Detalhes técnicos

- Google OAuth: usar `lovable.auth.signInWithOAuth("google", { redirect_uri: ${origin}/onboarding })`. Deduplicação via mesmo e-mail no Supabase é nativa (mesmo user_id).
- Onboarding aluno pós‑Google: validar `phone` (BR), `sex` (masculino/feminino/outro), `birth_date` (idade ≥ 14). Bloquear entrada no painel até preencher.
- Nenhuma alteração em regras financeiras, carteiras, RLS de tabelas existentes.

## Perguntas antes de executar

1. **Reset de senha (item 2):** posso rodar `supabase--configure_auth` para tentar ajustar, ou você prefere ajustar manualmente em Cloud → Users → Auth Settings → Redirect URLs adicionando `fitmindclub.com.br` e `www.fitmindclub.com.br`?
2. **Google login (item 3):** disponibilizar em **todas** as telas de registro (aluno/coach/parceiro/profissional) ou **só aluno + login geral**?