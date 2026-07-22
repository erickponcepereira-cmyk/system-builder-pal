
## Diagnóstico (verificado no banco)

**Nathan (screenshot):** `role='admin'`, sem registro em `coaches`, sem `commissions`, sem linha em `wallets`. A carteira dele está em R$ 0,00 porque **não há nada a exibir** — ele está usando o painel Coach via role‑switcher de admin, mas não é beneficiário de nenhuma comissão. Isso está correto e não é bug.

**O bug real (encontrado varrendo todas as carteiras):** existem **11 coaches** com comissões reais e **sem linha em `public.wallets`**. Como o `getWalletSplit` (refatorado há alguns turnos) lê direto de `wallets.available_balance`, esses coaches vêem R$ 0,00 mesmo tendo saldo. Valores hoje travados:

| Coach ID | Disponível | Pendente | # comissões |
|---|---:|---:|---:|
| 0dc01639… | 569,76 | 102,71 | 97 |
| 981348d5… | 374,82 | 29,76 | 21 |
| f25c12d0… | 186,62 | 63,80 | 66 |
| f9a44c8a… | 183,90 | 7,75 | 16 |
| a02409f6… | 65,76 | 133,35 | 7 |
| c261b7a2… | 118,96 | 0,00 | 6 |
| ac5ba444… | 0,00 | 69,78 | 3 |
| 02447f14… | 65,76 | 0,00 | 3 |
| 70fb77b4… | 0,00 | 63,57 | 1 |
| 91747bd9… | 0,00 | 63,57 | 1 |
| 77067d2a… | 1,32 | 0,00 | 5 |

Total travado ≈ **R$ 1.567 disponível + R$ 534 pendente**.

Confirmado com contraprovas: comissões vs `wallets`, `partner_wallets`, `professional_wallets` batem em todos os demais beneficiários (nenhum saldo negativo, nenhum saldo órfão positivo). O problema é exclusivamente a **ausência da linha em `wallets`** para esses 11.

**Causa raiz:** `recalc_wallet_for_profile` / `recalc_wallets_for_owner` fazem `UPDATE ... WHERE profile_id=?` sem `INSERT` prévio quando a linha não existe. A linha em `wallets` só é criada em outros caminhos (aprovação de coach, primeiro saque, etc.); coaches antigos ou aprovados por caminhos alternativos ficaram sem essa linha e todo `recalc` subsequente é no‑op.

## Correções

### 1. Migração — tornar `recalc_wallet_for_profile` idempotente e auto‑criadora
Reescrever a função para **`INSERT ... ON CONFLICT DO UPDATE`** em `wallets`, preenchendo `available_balance`, `pending_balance`, `total_earned`, `total_withdrawn` a partir de `commissions` + `withdrawal_requests` + débitos de mensalidade paga com carteira (mesma lógica que já usa hoje). `recalc_wallets_for_owner` continua chamando essa função — passa a criar a linha quando faltar.

### 2. Migração — backfill dos 11 coaches
No final da migração acima, `SELECT recalc_wallet_for_profile(c.id) FROM coaches c WHERE NOT EXISTS (SELECT 1 FROM wallets w WHERE w.profile_id=c.id) AND EXISTS (SELECT 1 FROM commissions x WHERE x.beneficiary_coach_id=c.id);`. Não hardcode dos 11 IDs — a query varre todos, então pega qualquer futuro caso do mesmo tipo se aparecer antes do deploy.

### 3. Migração — reconciliação total pós‑fix
Um `DO $$ ... $$` que roda `recalc_wallet_for_profile` para todos os beneficiários distintos em `commissions` (coach + profile). Garante que qualquer outra dessincronização silenciosa (não detectada nas minhas queries porque exigiria comparar somas em cada tabela) seja resolvida no mesmo deploy. Custo: baixo, poucas centenas de coaches.

### 4. Server fn admin de reconciliação sob demanda
`adminRecalcAllWallets()` em `src/lib/admin-financial.functions.ts` (protegida por `assertAdmin`) que executa o mesmo laço da etapa 3. Botão discreto no `admin.payments.tsx` ("Reconciliar carteiras") para uso futuro sem precisar de migração. Sem loading state complexo — só spinner + toast.

### 5. Guardrail — trigger em `commissions`
Adicionar/ajustar `AFTER INSERT OR UPDATE OR DELETE ON commissions` para chamar `recalc_wallet_for_profile(NEW.beneficiary_coach_id)` (e `OLD` quando aplicável). Se o trigger já existe, apenas confirmar o corpo. Como o `recalc` agora faz upsert, futuras comissões nunca mais ficam sem linha em `wallets`.

## Fora do escopo
- Não mexo em `partner_wallets` / `professional_wallets` / `student_wallets` — já batem 100%.
- Não mexo na UI da carteira — o problema é servidor/dados, não front.
- Não crio linha `wallets` para o Nathan (ele não é coach; a exibição zerada dele está correta).

## Detalhes técnicos
- Enum `commission_status` no projeto: `pending | available | withdrawn | cancelled` (usar exatamente esses valores).
- `wallets.profile_id` referencia `coaches.id` (não `profiles.user_id`) — o upsert usa o coach_id.
- `total_earned` = soma de `available + pending + withdrawn`; `total_withdrawn` = soma `withdrawal_requests` com status `paid` ou `approved` para aquele coach (mesma regra do código existente).
- Migração é read‑then‑write pura em `public.wallets`; não altera policies, grants nem enums.
