## Diagnóstico solicitado, sem alterar código

### O que encontrei agora

1. O cliente de autenticação está configurado para persistir sessão:
   - Arquivo: `src/integrations/supabase/client.ts`
   - Linhas relevantes:
     - `storage: typeof window !== 'undefined' ? localStorage : undefined` na linha 19
     - `persistSession: true` na linha 20
     - `autoRefreshToken: true` na linha 21
   - Interpretação: no navegador/WebView do APK, a sessão deveria ficar em `localStorage`.

2. O layout autenticado existe e está com `ssr: false`:
   - Arquivo: `src/routes/_authenticated/route.tsx`
   - Linhas relevantes:
     - `ssr: false` na linha 21
     - `supabase.auth.getSession()` na linha 23
     - `throw redirect({ to: "/login" ... })` nas linhas 25-28
   - Este é o redirect centralizado que pode mandar para `/login` antes das rotas filhas.

3. Ainda existem redirects adicionais para `/login` dentro de rotas/componentes autenticados:
   - `src/routes/_authenticated/admin.tsx`
     - linha 15: `if (!user) throw redirect({ to: "/login" });`
     - linha 22: `throw redirect({ to: "/login" });`
   - `src/components/admin/AdminShell.tsx`
     - linha 74: `supabase.auth.getSession()`
     - linha 76: `navigate({ to: "/login" })`
   - `src/routes/_authenticated/student.tsx`
     - linha 26: `supabase.auth.getUser()`
     - linha 30: `navigate({ to: "/login", ... })`
   - `src/routes/_authenticated/coach.tsx`
     - linha 156: `supabase.auth.getUser()`
     - linha 159: `navigate({ to: "/login", replace: true })`
   - `src/routes/_authenticated/partner.tsx`
     - linha 97: `supabase.auth.getUser()`
     - linha 98: `navigate({ to: "/login" })`
   - `src/routes/_authenticated/professional.tsx`
     - linha 96: `supabase.auth.getUser()`
     - linha 97: `navigate({ to: "/login" })`
     - linha 101: `navigate({ to: "/login" })`

4. O middleware `attachSupabaseAuth` não faz redirect:
   - Arquivo: `src/integrations/supabase/auth-attacher.ts`
   - Linha 9: chama `supabase.auth.getSession()` apenas para anexar `Authorization` em server functions.
   - Linhas 11-13: adiciona header se existir token.
   - Não há `redirect`, `navigate`, `signOut` ou remoção de sessão nele.

5. `src/start.ts` só registra o middleware:
   - Arquivo: `src/start.ts`
   - linha 5: `functionMiddleware: [attachSupabaseAuth]`
   - Não há lógica de logout ou redirect.

6. Há erro atual no preview antes da aplicação carregar:
   - `Dev server returned 500 for GET /src/routeTree.gen.ts`
   - Isso pode impedir qualquer diagnóstico visual em runtime enquanto não for resolvido, mas ainda não vou corrigir porque você pediu diagnóstico e logs sem novas alterações.

### Hipótese principal a confirmar com logs

A sessão pode estar sendo encontrada pelo layout `_authenticated`, mas uma rota filha/componente ainda pode chamar `getUser()` ou `getSession()` logo depois e navegar para `/login` se a restauração/refresh ainda não terminou ou se `getUser()` falhar temporariamente.

Os candidatos mais prováveis são:

- `/student`: `src/routes/_authenticated/student.tsx:26-30`
- `/coach`: `src/routes/_authenticated/coach.tsx:156-159`
- `/admin`: `src/components/admin/AdminShell.tsx:74-76` e `src/routes/_authenticated/admin.tsx:13-22`
- `/partner`: `src/routes/_authenticated/partner.tsx:97-98`
- `/professional`: `src/routes/_authenticated/professional.tsx:96-101`

### Plano de instrumentação para diagnosticar sem corrigir comportamento

Vou adicionar apenas logs, sem mudar regras de autenticação, sem remover redirects e sem alterar fluxo.

#### 1. Logs no boot da aplicação em `src/routes/__root.tsx`

Adicionar logs no `useEffect` inicial para registrar:

```ts
console.log("[AUTH] pathname:", window.location.pathname);
console.log(
  "[AUTH] localStorage token raw:",
  localStorage.getItem("sb-myqyjifvrlwvesrwubsg-auth-token"),
);
console.log("[AUTH] getSession:", data.session);
console.log("[AUTH] user:", data.session?.user?.id);
```

Objetivo: confirmar se a chave `sb-myqyjifvrlwvesrwubsg-auth-token` existe no primeiro boot e se `getSession()` a restaura.

#### 2. Logs no gate central `src/routes/_authenticated/route.tsx`

Adicionar logs imediatamente antes do redirect:

```ts
console.log("[AUTH] pathname:", window.location.pathname);
console.log(
  "[AUTH] localStorage token raw:",
  localStorage.getItem("sb-myqyjifvrlwvesrwubsg-auth-token"),
);
console.log("[AUTH] getSession:", data.session);
console.log("[AUTH] user:", data.session?.user?.id);
console.log("[AUTH] redirect executado em src/routes/_authenticated/route.tsx:25", {
  hasError: !!error,
  hasSession: !!data.session,
  hasUser: !!data.session?.user,
});
```

Objetivo: mostrar se a chave existe antes do redirect e se o próprio layout é quem está mandando para `/login`.

#### 3. Logs nos outros pontos que também redirecionam para `/login`

Adicionar logs mínimos antes dos redirects encontrados, sem alterar lógica:

- `src/routes/_authenticated/admin.tsx`
  - antes das linhas 15 e 22
- `src/components/admin/AdminShell.tsx`
  - antes da linha 76
- `src/routes/_authenticated/student.tsx`
  - antes da linha 30
- `src/routes/_authenticated/coach.tsx`
  - antes da linha 159
- `src/routes/_authenticated/partner.tsx`
  - antes da linha 98
- `src/routes/_authenticated/professional.tsx`
  - antes das linhas 97 e 101

Cada log terá o padrão:

```ts
console.log("[AUTH] redirect executado em <arquivo>:<linha>", { ...dados });
```

E também registrará:

```ts
console.log("[AUTH] pathname:", window.location.pathname);
console.log("[AUTH] localStorage token raw:", localStorage.getItem("sb-myqyjifvrlwvesrwubsg-auth-token"));
console.log("[AUTH] user:", user?.id);
```

#### 4. Verificar middleware TanStack Start

Confirmar via código/log que:

- `src/start.ts` não faz redirect.
- `src/integrations/supabase/auth-attacher.ts` só anexa token em chamadas de server function.
- Se necessário, adicionar log no `auth-attacher.ts` apenas para diagnóstico:

```ts
console.log("[AUTH] attachSupabaseAuth session:", data.session);
console.log("[AUTH] attachSupabaseAuth user:", data.session?.user?.id);
```

#### 5. Resultado esperado após rodar com os logs

Depois de abrir o app novamente, o console deve mostrar exatamente uma destas situações:

1. `localStorage` existe e `getSession()` retorna sessão no `__root`, mas uma rota filha redireciona.
   - Diagnóstico: redirect duplicado em rota/componente filho.

2. `localStorage` existe, mas `getSession()` retorna `null` no `_authenticated`.
   - Diagnóstico: problema na restauração/leitura da sessão pelo cliente no momento do guard.

3. `localStorage` não existe no boot após fechar/reabrir.
   - Diagnóstico: a sessão realmente não está sendo persistida no ambiente, ou está sendo removida antes do boot.

4. `localStorage` existe, `getSession()` retorna sessão, mas `admin.tsx` redireciona por role/profile.
   - Diagnóstico: sessão ok; problema é autorização/perfil, não persistência.

### Entrega após instrumentar

Vou apresentar:

- sessão encontrada ou não;
- localStorage encontrado ou não;
- quem executou o redirect;
- arquivo e linha do redirect;
- se `attachSupabaseAuth` interferiu ou não;
- lista final de guards/redirects ainda ativos.

Nenhuma correção funcional será feita nesta etapa.