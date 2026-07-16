## Problema

Ao clicar em **Excluir** em `admin.students.tsx`, o backend retorna:
> `Falha ao limpar dependências: permission denied for function admin_purge_user_dependents`

A função é `SECURITY DEFINER` e já valida internamente que o chamador é admin, mas uma migração anterior (`20260622152313`) revogou `EXECUTE` de `authenticated`, e o `adminDeleteUser` a chama via `context.supabase` (sessão do admin logado = role `authenticated`), portanto o Postgres bloqueia antes de rodar a checagem interna.

Além disso, o usuário precisa:
1. Excluir o cadastro do **Jonathan Uzziel Vasquez Gervacio** (coach, `mensphysiqueuzzie@gmail.com`), que ficou preso.
2. Ter uma opção para **editar** os dados de um cadastro quando forem preenchidos errados (sem precisar excluir e recriar).

## O que vou fazer

### 1. Corrigir a permissão da função (migração)
Restaurar `GRANT EXECUTE ON FUNCTION public.admin_purge_user_dependents(uuid) TO authenticated`. A função continua segura porque já bloqueia não-admins com `RAISE EXCEPTION 'Acesso negado'`.

### 2. Excluir o cadastro do Jonathan
Após a migração acima ser aprovada, rodo:
- `admin_purge_user_dependents(user_id do Jonathan)` para limpar dependências (transações, comissões, subscriptions, coach, profile etc.).
- `auth.admin.deleteUser` não é acessível pelas ferramentas de banco; então, no lugar, deleto diretamente o `profiles` e o `coaches` dele — o CASCADE nas FKs cuida do resto. Se sobrar algum resíduo no `auth.users`, faço o `DELETE FROM auth.users WHERE id = ...` na mesma migração de execução.

### 3. Botão "Editar" no painel de alunos
Em `src/routes/_authenticated/admin.students.tsx`, ao lado de **Promover / Trocar coach / Excluir**, adicionar botão **Editar** que abre um modal para corrigir os campos básicos do cadastro:

- Nome
- E-mail
- WhatsApp / telefone
- CPF
- Data de nascimento

Salvar chama uma nova server function `adminUpdateProfile` (em `src/lib/admin-users.functions.ts`) que:
- Verifica que o chamador é admin (`assertAdminProfile`).
- Atualiza `profiles` via `supabaseAdmin`.
- Se o e-mail mudou, atualiza também `auth.users` via `supabaseAdmin.auth.admin.updateUserById`.

Escopo intencionalmente enxuto: só os campos de identificação básicos do perfil. Ajustes de coach/aluno específicos (rede, comissão, turmas etc.) continuam nos painéis próprios.

## Arquivos afetados

- `supabase/migrations/<nova>.sql` — restaurar GRANT EXECUTE.
- Execução SQL — purgar + apagar o cadastro do Jonathan.
- `src/lib/admin-users.functions.ts` — nova `adminUpdateProfile`.
- `src/routes/_authenticated/admin.students.tsx` — botão **Editar** + modal.

## Confirmação

Confirma que posso: (a) restaurar o GRANT, (b) excluir o cadastro do Jonathan Uzziel Vasquez Gervacio (`mensphysiqueuzzie@gmail.com`), (c) adicionar o botão Editar com os campos listados?
