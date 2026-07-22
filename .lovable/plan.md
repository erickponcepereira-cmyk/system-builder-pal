## Problema

Em `src/lib/collab.functions.ts` → `listCoproducerCandidates`, a query de profissionais é:

```ts
supabase.from("coaches").select("id,role,profiles:profile_id(name)").eq("role", "professional")
```

A tabela `coaches` não tem coluna `role` — o filtro nunca casa e nenhum profissional aparece. Por isso Luana (que está em `coaches` com `is_professional = true`, upline = Delma) não aparece para a Delma. A flag correta é `is_professional`.

Além disso, hoje a lista traz **todos** os parceiros/profissionais aprovados do sistema. O pedido é "inicialmente apenas da rede".

## Correção

Ajustar apenas `listCoproducerCandidates` em `src/lib/collab.functions.ts`:

1. **Profissionais**: trocar `.eq("role","professional")` por `.eq("is_professional", true)`, exigir `approved_at IS NOT NULL` e `blocked_at IS NULL`.
2. **Escopo por rede** (quando o solicitante for coach/profissional):
   - Descobrir o `coach_id` do usuário logado (via `profile_id` do `context.userId`).
   - Rede = downline direto/indireto + upline + o próprio upline_coach. Implementação simples: buscar todos os coaches onde `upline_coach_id = meuCoachId` (nível 1-N por recursão simples em 3 níveis) **e** o meu upline.
   - Parceiros da rede: `partners.referrer_coach_id` (ou coluna equivalente) dentro do conjunto de coaches da rede + o próprio.
3. **Fallback "código"**: manter o campo "Fora da lista? Usar código" já existente no `CoproductionEditor` para casos fora da rede.
4. Manter exclusão do próprio criador (`excludeType`/`excludeId`).

Nenhuma mudança de UI, schema, ou lógica de repasse — apenas o filtro de candidatos.

## Verificação

Antes de finalizar, confirmar via `supabase--read_query` a coluna usada em `partners` para referenciar o coach (ex.: `referrer_coach_id` vs `coach_id`) e ajustar a query. Depois testar com Delma → Luana deve aparecer.
