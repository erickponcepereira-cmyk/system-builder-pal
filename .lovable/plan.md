
## Objetivo

1. Cada coach conecta a própria conta Google e vê só a sua agenda.
2. Toda agenda também fica salva internamente (banco do app).
3. Admin tem um painel que mostra todas as agendas (compiladas e filtráveis por coach).

## Arquitetura

```text
Coach → "Conectar Google" → OAuth Google (consent) → callback salva tokens
                                                       ↓
                                    coach_google_tokens (por user_id)
                                                       ↓
                              Sync periódico/sob demanda
                                                       ↓
                              internal_appointments (compartilhada)
                                                       ↓
                       Coach vê só os seus  |  Admin vê todos
```

## Banco de dados (Lovable Cloud)

**`coach_google_tokens`**
- `user_id` (uuid, FK auth.users, unique)
- `coach_id` (uuid)
- `access_token` (text, criptografado em repouso pela cloud)
- `refresh_token` (text)
- `expires_at` (timestamptz)
- `google_email` (text)
- `scope` (text)

**`internal_appointments`**
- `coach_id` (uuid)
- `google_event_id` (text, único por coach)
- `summary` (text)
- `description` (text)
- `start_at` / `end_at` (timestamptz)
- `attendee_name` / `attendee_email` (text)
- `student_id` (uuid, opcional — link com aluno)
- `location` (text)
- `status` (text: confirmed/cancelled)
- `last_synced_at` (timestamptz)

**RLS:**
- `coach_google_tokens`: cada usuário só lê/escreve a própria linha. Service role para refresh no servidor.
- `internal_appointments`: coach vê só linhas com `coach_id = seu coach_id`. Admin (`has_role(auth.uid(),'admin')`) vê tudo.

## OAuth Google por usuário

Lovable Cloud só gerencia o Google login do app, não o acesso à API Calendar de cada usuário. Para isso precisa de credenciais OAuth próprias.

**Você precisa criar no Google Cloud Console:**
1. Projeto → ativar **Google Calendar API**
2. Tela de consentimento OAuth (External), adicionar escopos `calendar.readonly` e `calendar.events`
3. Credenciais → OAuth Client ID (Web Application)
4. URL de callback autorizada: `https://fitmindclub.lovable.app/api/oauth/google/callback` (e a URL de preview)

Depois eu peço dois secrets via formulário seguro:
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

## Rotas e funções de servidor

- `GET /api/oauth/google/start` — gera state CSRF, redireciona para Google com `access_type=offline&prompt=consent` (garante refresh_token).
- `GET /api/oauth/google/callback` — troca code por tokens, salva em `coach_google_tokens`, redireciona para `/coach`.
- `serverFn syncMyCalendar()` — usa refresh_token, chama Google Calendar API direto (sem gateway, é OAuth do próprio usuário), faz upsert em `internal_appointments`.
- `serverFn getMyUpcoming()` — lê `internal_appointments` do coach logado.
- `serverFn getAllUpcoming({ coachId? })` — admin only; filtra por coach opcionalmente.

Helper de refresh: se `expires_at` passou, troca refresh_token por novo access_token e atualiza linha.

## UI

**Coach › Visão geral**
- Card "Próximos atendimentos" (já criado) passa a ler de `internal_appointments`.
- Se coach ainda não conectou Google: botão **Conectar Google Agenda** (vai para `/api/oauth/google/start`).
- Se conectado: mostra email Google + botão "Sincronizar agora" e "Desconectar".

**Admin › nova aba "Agendas"** (`/admin/calendars`)
- KPIs: total de atendimentos hoje / semana, coaches conectados.
- Filtro por coach (select) e por período.
- Visões: lista cronológica + agrupado por coach (accordion).
- Cada item mostra coach, aluno, horário, status.

## Segurança

- State CSRF (cookie httpOnly) na ida e vinda do OAuth.
- Tokens só lidos/escritos via service role em server functions.
- RLS bloqueia leitura cruzada entre coaches.
- Validação Zod em todas as inputs.

## Entrega em fases

1. **Fase 1 (esta resposta após aprovação):** migração das tabelas + RLS, peço os 2 secrets do Google.
2. **Fase 2:** rotas OAuth, server functions, troca do card do coach para usar a base interna + botão conectar.
3. **Fase 3:** painel admin `/admin/calendars` com filtros e agrupamento.

## O que preciso de você

1. Aprovar este plano.
2. Criar credenciais OAuth no Google Cloud Console e ter `Client ID` e `Client Secret` em mãos (vou pedir num formulário seguro depois da migração).
