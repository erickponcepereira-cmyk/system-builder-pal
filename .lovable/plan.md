# Corrigir travamento na tela de splash "FitMind secrets"

## Diagnóstico

O `AuthLoadingGate` decide mostrar o splash enquanto `showSplash = !sessionResolved || stillRedirecting`. Existem 3 caminhos onde ele pode ficar travado — e todos aparecem "às vezes" porque dependem de timing/rede:

1. **`getSession()` demora >4s** — o timeout atual funciona, mas só cobre esse ponto.
2. **`stillRedirecting` fica preso**: quando há sessão e a rota é `/` ou `/login`, o gate chama `navigate({ to: "/portal-selector" })` e marca `redirectedRef.current = true`. Se a navegação falhar silenciosamente (router ainda hidratando, erro de rota, race com `onAuthStateChange` no primeiro mount nativo), o `pathname` nunca muda, o `ref` bloqueia nova tentativa, e o splash fica eterno.
3. **`onAuthStateChange` chega antes de `getSession()` resolver em cold start no Android**: o listener seta `sessionResolved=true` cedo, o effect de redirect dispara com `pathname` ainda inicial, marca `redirectedRef=true`, e se o TanStack Router não estiver pronto para navegar, cai no caso 2.

Sem logs de `[AUTH_GATE]` no console dessa sessão, então o travamento não deixa rastro — mais um indício de que é o splash ficando na tela sem qualquer decisão nova.

## Correção (apenas `src/components/AuthLoadingGate.tsx`)

1. **Cap absoluto do splash (safety net universal)**: um único `setTimeout` de ~5s no mount que força `sessionResolved=true` **e** libera o splash mesmo se `stillRedirecting` ainda for true. Se a navegação falhar, o usuário vê a landing/login (funcional) em vez de tela preta.

2. **Retry de navegação com watchdog**: após chamar `navigate({ to: "/portal-selector" })`, agendar um `setTimeout(1500ms)`. Se `pathname` continuar `/` ou `/login`, resetar `redirectedRef` e:
   - tentar novamente `navigate(...)` uma vez;
   - se ainda assim não mudar em +1500ms, cair para `window.location.replace("/portal-selector")` como último recurso.

3. **Só marcar `redirectedRef` depois que a navegação tiver efeito**: mover o `redirectedRef.current = true` para dentro de um effect que observa a mudança de `pathname`, não antes de chamar `navigate`. Assim uma navegação falhada não bloqueia futuras tentativas.

4. **Evitar decisão prematura pelo listener**: no `onAuthStateChange`, só marcar `sessionResolved=true` no evento `INITIAL_SESSION` (que representa a resposta canônica) — nos demais eventos apenas atualizar `hasSession`. Isso remove a race do caso 3 sem impactar logout (que já tem tratamento próprio).

5. **Log adicional** quando o cap de 5s dispara (`[AUTH_GATE] hard cap release`) para conseguir diagnosticar reincidências.

## Escopo

- Um único arquivo alterado: `src/components/AuthLoadingGate.tsx`.
- Sem mudanças de rota, backend, ou fluxo de auth.
- Comportamento normal (sessão resolve rápido) fica idêntico; as novas defesas só atuam quando algo demora ou falha.
