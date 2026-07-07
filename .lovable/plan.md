## Diagnóstico

O badge "Sem mensalidade" vem de `computeMonthly()` em `src/lib/partner-approvals.functions.ts` (linhas 322-343). A regra é:

- Se não existe registro em `user_subscriptions` **e** não existe `subscription_invoices` → `none` → "Sem mensalidade".
- Caso exista subscription, o status só vira `exempt` quando `user_subscriptions.status` é um dos: `exempt_monthly`, `exempt_annual`, `exempt_permanent`.

Consultando o banco para os parceiros CF6800 e Academia (screenshot):

| fantasy_name | activation_source | sub_status | paid_until | invoices |
|---|---|---|---|---|
| CF6800 | already_partner | active | null | 0 |
| Academia | already_partner | active | null | 0 |

Ou seja: eles **têm** subscription (`status=active`), mas sem `paid_until` e sem invoices. Como `active` não bate com nenhum dos ramos do `if/else if`, o status cai no default `none` → mostra "Sem mensalidade". Verificado também que hoje **todas** as linhas em `user_subscriptions` têm `status='active'` — os valores `exempt_*` nunca são gravados.

Além disso, esses parceiros vêm de `activation_source = 'already_partner'` (parceiros históricos importados), que pela regra do produto **não têm mensalidade** — só pagam anuidade (que já aparece como "Paga em 07/07/2026").

Portanto o badge está tecnicamente correto ("não há mensalidade registrada"), mas o rótulo é enganoso: passa a impressão de pendência/faltando algo, quando na verdade o parceiro é isento por ser histórico.

## Correção proposta

1. Em `src/lib/partner-approvals.functions.ts`, ajustar `computeMonthly` para receber também o `activation_source` do parceiro e:
   - Se `activation_source === 'already_partner'` → status `exempt` com sub-motivo `historic`.
   - Manter o resto da lógica.
2. Em `src/routes/_authenticated/admin.partner-releases.tsx`:
   - Adicionar rótulo específico "Isento — parceiro histórico" (ou similar) quando o motivo for `historic`, mantendo o estilo verde do `exempt`.
   - Manter "Sem mensalidade" apenas para o caso realmente sem cadastro (fallback defensivo).
3. Aplicar o mesmo raciocínio nas telas equivalentes `admin.professional-releases.tsx` e `admin.coach-releases.tsx` (se houver `activation_source` correspondente para profissionais/coaches — verificar antes de tocar).

### Fora do escopo (só sinalizar ao usuário)

- O fato de nenhuma linha em `user_subscriptions` usar os status `exempt_*` sugere que o fluxo de isenção nunca é gravado no banco — isso é um débito separado do sistema de assinatura e não precisa ser resolvido para corrigir o badge.

Confirma que quer que eu aplique essa correção (rótulo "Isento — parceiro histórico" para `already_partner`)?