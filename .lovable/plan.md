## Problema

Duas situações travam o app na splash "Conectando corpo e mente":

**1. Depois de sair (logout)**
`AuthLoadingGate` só chama `supabase.auth.getSession()` **uma única vez** no primeiro mount. Quando o usuário faz logout, o estado local `hasSession` fica `true` para sempre, e como o pathname passa a ser `/login`, a condição:

```ts
const stillRedirecting =
  sessionResolved && hasSession && (pathname === "/" || pathname === "/login");
```

fica permanentemente `true` → splash fixo. Fechar/abrir o app remonta o componente e resolve. Além disso, `redirectedRef.current` não é resetado no logout, então mesmo que o estado atualizasse a próxima navegação também poderia travar.

**2. Ao atualizar a página**
`getSession()` pode demorar/pendurar em rede ruim (mobile/APK). Como o splash só some quando `sessionResolved` vira `true`, se a promise não resolver, a splash fica infinita. Não há timeout.

## Correção

Arquivo único: `src/components/AuthLoadingGate.tsx`

1. **Assinar `supabase.auth.onAuthStateChange`** dentro do mesmo `useEffect` inicial, além do `getSession()`. Nos eventos `SIGNED_OUT`/`USER_UPDATED`/`SIGNED_IN`, atualizar `hasSession` de acordo com `session?.user`. No `SIGNED_OUT`, também resetar `redirectedRef.current = false`. Retornar o `unsubscribe` no cleanup.

2. **Timeout de segurança para `getSession()`**: usar `Promise.race` com `setTimeout` de 4 s. Se estourar, tratar como "sem sessão" e liberar o splash (`setSessionResolved(true)`, `setHasSession(false)`). Isso evita splash infinita em rede lenta — se a sessão realmente existir, o `onAuthStateChange` corrige `hasSession` assim que o cliente terminar de restaurar.

3. **Resetar `redirectedRef` quando o pathname sai de `/portal-selector`** (o usuário já foi para outro painel), para que um logout+login seguinte volte a redirecionar corretamente.

## Fora de escopo

- Nenhuma mudança nas rotas, no `portal-selector`, no `login` ou nos gates de painel.
- Nenhuma alteração em RLS, migrações ou server functions.
- Estética da splash permanece igual.

## Validação

- Login → escolher painel → clicar em "Sair": deve voltar para `/login` sem splash preso.
- Estar logado, fazer refresh da página com rede lenta: no pior caso o splash cai em ~4 s e o app renderiza a rota atual, sem exigir fechar/abrir.
- Novo login depois do logout continua redirecionando para `/portal-selector` normalmente.
