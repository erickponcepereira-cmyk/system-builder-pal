## Problema

Ao fazer login com uma conta de parceiro (ex.: Bulba Cross), o `/portal-selector` abre **sem exibir nenhum card** de painel (nem "Painel de Parceiro"). No banco a conta está correta: `profiles.role='partner'`, `profiles.status='active'`, existe linha em `partners` com `status='pending'`. As RLS permitem o SELECT do próprio registro. Portanto, logicamente, o botão "Painel de Parceiro" deveria aparecer.

Não há erro de build recente; o console não mostra `[PORTAL] mounted` nem `[AUTH_GATE] sessão encontrada` — indício de que a página não termina de resolver ou renderiza um estado silencioso (sem loading, sem erro, sem opções).

## Suspeitas

`src/routes/_authenticated/portal-selector.tsx` usa `as never` na consulta a `partners`:

```ts
supabase.from("partners" as never).select("id" as never).eq("profile_id" as never, profile.id).maybeSingle()
```

Esses casts existem por herança (antes de `partners` estar em `types.ts`). Hoje a tabela já tem tipos gerados. O `as never` mascara qualquer falha de tipo/consulta e pode ter passado a devolver `undefined`/erro silencioso após atualizações de `@supabase/supabase-js` ou dos tipos, resultando em `partner = undefined`. Nesse caso, `canPartner` ainda deveria ser `true` via `role === "partner"` — o que sugere que talvez o `Promise.all` esteja **rejeitando** e caindo no catch com uma mensagem obscura, ou o `profile.role` está chegando diferente do esperado.

Sem logs conclusivos do cliente, a correção segura combina três coisas:

1. Remover os `as never` e destravar tipagem real da consulta a `partners`.
2. Tornar cada consulta do `Promise.all` tolerante a erro individual (não deixar uma falha derrubar as demais).
3. Adicionar logs de diagnóstico para o próximo turno já mostrar o que está acontecendo com esse usuário.

## Mudanças

Arquivo único: `src/routes/_authenticated/portal-selector.tsx`

1. **Tipagem correta de `partners`**
   - Remover todos os `as never` na query de `partners` (tabela já tem tipos gerados).

2. **Consultas resilientes**
   - Substituir `Promise.all` por `Promise.allSettled` para coach/student/partner.
   - Tratar cada resultado independentemente: se der erro, logar e considerar `null` (não abortar a tela).

3. **Fallback por `role`**
   - Garantir que, mesmo se a query de `partners` falhar, `canPartner = profile.role === "partner" || !!partner`. Mesma lógica para `canStudent`.
   - Se `count === 0` E houve erro em alguma sub-query, mostrar a mensagem "Não foi possível carregar suas permissões" com botão "Tentar novamente" (novo botão que dispara `location.reload()`), em vez de "Nenhum painel liberado".

4. **Logs de diagnóstico** (temporários, retirar depois)
   - `console.log("[PORTAL] profile", { id, role, status })`
   - `console.log("[PORTAL] rows", { coach, student, partner })`
   - `console.log("[PORTAL] flags", available, "count", count)`
   - Em cada catch de sub-query: `console.error("[PORTAL] query failed", key, error)`

## Fora de escopo

- Nenhuma alteração em `PartnerOnboardingGate`, `partner.tsx`, migrações, ou fluxo de aprovação.
- Nenhuma mudança nas RLS de `partners` (já corretas).
- Login/AuthLoadingGate seguem inalterados.

## Validação

Após o deploy, pedir ao usuário para reproduzir e conferir o console — os novos logs `[PORTAL]` mostrarão exatamente qual sub-query falhou (se alguma) e quais flags foram calculadas. Com isso podemos, no próximo turno, remover os logs e travar o caso raiz caso ainda apareça algum comportamento estranho.
