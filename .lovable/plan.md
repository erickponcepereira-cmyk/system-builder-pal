## Objetivo

Eliminar o redirect automático para um painel específico após o login quando o usuário tem acesso a mais de um (admin + aluno, coach + aluno, etc.) e garantir que o link de indicação `/r/$code` sempre leve para a loja como aluno, mesmo se o usuário logado for admin/coach/parceiro.

## Mudanças

### 1. `src/routes/login.tsx` — sempre perguntar quando houver 2+ painéis

Hoje a função `routeSignedInUser` só mostra o seletor quando `canCoach && canStudent`. Admin entra direto, mesmo tendo registro em `students`.

- Trocar o estado `accessOptions: { coach, student }` por `accessOptions: { admin, coach, student, partner }`.
- Calcular `canAdmin` (role admin/director/manager), `canCoach` (registro em `coaches` ou role gerencial), `canStudent` (registro em `students`), `canPartner` (registro em `partners`).
- Se a soma de painéis disponíveis for ≥ 2, mostrar o seletor com botões para cada painel disponível. Caso contrário, entrar direto no único painel.
- Não persistir a escolha (sem localStorage); a tela aparece em todo login.
- Estender o bloco de UI atual (linhas 304-322) para renderizar dinamicamente os botões disponíveis (Admin, Coach, Aluno, Parceiro), reaproveitando o `enterArea` existente.

### 2. `src/routes/r.$code.tsx` — forçar aluno direto na loja

Substituir a lógica atual de checar `profile.role === "student"` (que falha para admins com perfil de aluno) por:

- Se há sessão ativa, consultar `students` por `profile_id` do usuário.
- Se existir registro de aluno → setar `sessionStorage.fitmind_selected_area = "student"` e navegar para `/student/store` (sem deslogar, sem perguntar).
- Se não existir → deslogar e mandar para `/register` como aluno (fluxo atual).
- Se não há sessão → fluxo atual de cadastro.

Isso garante que admin/coach/parceiro abrindo o link vai direto para a loja na área do aluno, independentemente do `profiles.role`.

### 3. Impacto colateral

- A flag `sessionStorage.fitmind_selected_area` continua sendo o que o `_authenticated` (e telas de aluno) usam para saber em qual painel o usuário está; manter o comportamento atual.
- Nenhuma mudança de schema; nenhuma migração necessária.
- Nenhuma mudança nas rotas protegidas (`/admin/*`, `/coach/*`, `/student/*`, `/partner/*`) — elas continuam acessíveis se o usuário tiver os registros correspondentes.

## Arquivos tocados

- `src/routes/login.tsx` (lógica de roteamento pós-login + UI do seletor)
- `src/routes/r.$code.tsx` (detecção via tabela `students` em vez de `profiles.role`)
