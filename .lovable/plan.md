## Objetivo
Criar o produto **Benefícios SINDSCOND** (R$ 20) na loja do profissional Sindscond com uma cascata financeira específica, sem quebrar os demais produtos parceiro/profissional que continuam usando a cascata padrão (taxa cartão/pix → 6% Simples → 5% sistema → 10% coach → rede 3/2/1).

## Regra de distribuição do produto novo
Sobre R$ 20 (exemplo):
1. Taxa cartão/pix (config global já existe) → R$ 1,00 (cartão 4,98%) ou R$ 0,20 (pix 0,99%)
2. **Sem** Simples Nacional (skip_tax)
3. Taxa do sistema = **30%** do saldo → R$ 5,70 (admin_wallet)
4. Criador (Sindscond) = **30%** do saldo → R$ 3,99 (`partner_net_amount`)
5. Cadeia comercial = saldo restante → R$ 9,31 (`coach_commission_amount`)
6. Rede sobre a cadeia comercial: **L1 10% / L2 5% / L3 3%** → R$ 0,93 / 0,47 / 0,28 (total R$ 1,68)
7. Vendedor (coach) = cadeia − rede → R$ 7,63 (`coach_net_amount`)

Se algum nível da rede não existir, o valor daquele nível cai para o vendedor (comportamento atual já existente é preservado pela mesma lógica de fallback).

**Master coach cross-sale**: continua funcionando igual — se o coach que faz a venda não é o dono do aluno e é Master Coach, ele recebe o % configurado no beneficiário sobre `coach_net_amount` (regra atual mantida).

## Abordagem técnica
Reaproveitar as colunas atuais de `partner_product_orders` (mapeamento perfeito: `partner_net_amount`=criador; `coach_commission_amount`=cadeia; `network_l1/2/3_amount`, `coach_net_amount`, `master_coach_cross_bonus_amount`). Adicionar em `professional_products` (e simetricamente `partner_products` para uso futuro) colunas opcionais de override que ativam uma nova cascata dentro das mesmas funções SQL de criação de pedido.

### Migration 1 — schema
Adicionar em `professional_products` e `partner_products`:
- `custom_split boolean not null default false`
- `skip_tax boolean not null default false`
- `system_fee_pct_override numeric` (nullable)
- `creator_pct_override numeric` (nullable) — % do criador sobre saldo após sistema
- `network_l1_pct_override numeric`, `network_l2_pct_override numeric`, `network_l3_pct_override numeric` (nullable)

### Migration 2 — funções de criação de pedido
Reescrever de forma retrocompatível (mesmas assinaturas / grants):
- `create_partner_product_order(_student_id, _partner_product_id, _payment_method, _referred_by_student_id)`
- `create_partner_product_order(_professional_product_id, _payment_method, _buyer_student_id, _referred_by_student_id)` (variante profissional)
- `create_scheduled_professional_order(...)` (para simetria)
- `create_partner_company_order(...)` (para simetria)

Cada uma detecta `v_prod.custom_split`:
- **false** → cascata atual **inalterada** (fee → 6% tax → 5% sys → coach_pct → rede 3/2/1).
- **true** → nova cascata:
  - `v_tax := 0` se `skip_tax`, senão mantém 6% (ou usa `tax_pct_override` se quiser — deixamos só o boolean por enquanto)
  - `v_sys := ROUND(v_rem * system_fee_pct_override / 100, 2)` (default 5)
  - `v_partner_share := ROUND(v_rem * creator_pct_override / 100, 2)` (criador)
  - `v_coach_amt := v_rem - v_partner_share` (cadeia comercial)
  - `v_l1 := ROUND(v_coach_amt * l1_override / 100, 2)` (idem l2, l3)
  - `v_coach_net := v_coach_amt - v_l1 - v_l2 - v_l3` (menos fitcoin/master igual hoje)
  - `coach_commission_pct` gravado como `100 - creator_pct` (para relatórios não estranharem)

Todos os triggers/downstream (`_apply_partner_order_on_paid`, `recalc_wallets_for_owner`, relatórios em `admin.payments`, `coach-reports`, `partner-reports`, `top-selling-products`, `admin-financial`) continuam funcionando porque só leem os valores já materializados nas colunas do pedido.

### Migration 3 — inserir o produto
1. Localizar `professional_coach_id` e `partner_id` do usuário `sindscond@gmail.com` (via `profiles`/`coaches`).
2. INSERT em `professional_products` com:
   - `name = 'Benefícios SINDSCOND'`, `price = 20`, `status = 'approved'`, `is_active_by_professional = true`, `is_schedulable = false`
   - `custom_split = true`, `skip_tax = true`, `system_fee_pct_override = 30`, `creator_pct_override = 30`, `network_l1/2/3_pct_override = 10/5/3`
   - `coach_commission_percentage = 70` (só para telas legadas exibirem coerente)
   - Descrição curta explicando o benefício

Se o Sindscond ainda estiver pendente de aprovação, a migration não força aprovação — ela só valida existência do registro; caso ele não esteja aprovado, o produto fica salvo mas o storefront respeita `is_active_by_professional`. **Se você quiser que eu aprove o Sindscond nessa mesma migration**, aviso na revisão e adiciono o UPDATE de aprovação.

## Frontend
Nenhuma mudança obrigatória. A `PartnerProfessionalStore` já lista `professional_products` aprovados e chama o RPC de pedido que já retorna os valores materializados. Simuladores em `partnerFinance.ts` continuam corretos para produtos padrão; para o Sindscond o simulador teórico ficará ~R$ 0,50 diferente do real (não é bloqueante), então **não** vou alterar os simuladores nesta entrega para não introduzir risco fora do escopo.

## Validação antes de devolver
Após aplicar as migrations:
1. `supabase--read_query` no produto criado para confirmar overrides gravados.
2. Simular manualmente a cascata com valores 20/pix e 20/cartão via SELECT computando as fórmulas e conferir com os números do enunciado (5,70 / 3,99 / 9,31 / 1,68 / 7,63).
3. `supabase--read_query` para checar que produtos parceiros existentes NÃO têm `custom_split=true` (garantia de não-regressão).
4. Confirmar que o produto aparece no `professional_products` do Sindscond com `is_active_by_professional=true` e `status='approved'`.

## Fora de escopo
- Alterar simuladores/relatórios teóricos com a nova cascata (não é necessário para o fluxo de venda funcionar).
- Editor visual dos overrides no painel admin/profissional — deixamos os overrides configuráveis só via SQL nesta entrega; se você quiser um formulário no admin depois, faço em iteração separada.
