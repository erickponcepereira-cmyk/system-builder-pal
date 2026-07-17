## Objetivo

Eliminar qualquer valor "fantasma" na carteira (residual entre `pending + disponível + sacado ≠ ganho total`) e garantir que o saque, que hoje sai da carteira principal + parceiro + profissional, **zere/drene proporcionalmente também as carteiras de parceiro e profissional** quando pago — não só quando reservado. Correção sistêmica, aplicada a todos os usuários.

## Diagnóstico confirmado

Li a função atual `public.recalc_wallets_for_owner(_profile_id)` (fonte de verdade das 3 carteiras) e identifiquei 2 defeitos que causam divergência de centavos e "sobras" em `partner_wallets` / `professional_wallets`:

1. **`v_paid_withdrawn_main` só é subtraído da carteira principal.** Se o saque pago foi maior do que o `available` da carteira principal (o que acontece hoje porque saque drena main → parceiro → profissional), o excedente **não é abatido** de `partner_avail_raw` nem de `coach_avail_raw`. Resultado: carteira de parceiro/profissional continua mostrando saldo que já foi sacado.
2. **O "drain" cross-wallet só existe para saques ativos** (`requested/approved/processing`). Quando o saque muda para `paid`, ele sai da lista de reservas ativas e volta a inflar partner/professional. É exatamente a raiz do "R$ 9,06 fantasma" (e de qualquer outra sobra que apareceria após aprovação).

Além disso, `wallets.pending_balance`, `partner_wallets` e `professional_wallets` são atualizados por triggers independentes — se algum trigger falhar em uma transação, a linha fica com valor stale até o próximo recalc. Não há garantia de invariante `pending + available + withdrawn = total_earned`.

## O que vai mudar

### 1. Reescrever `recalc_wallets_for_owner` como fonte única e consistente

Nova ordem de cálculo (uma única SECURITY DEFINER, todas as 3 carteiras na mesma transação):

```text
raw_main    = Σ commissions liberadas (não-rede ou rede com mês desbloqueado)
raw_partner = Σ partner_product_orders (partner_id)   liberadas (>7d)
raw_pro     = Σ partner_product_orders (professional) liberadas (>7d)

total_paid_seller     = Σ withdrawal_requests(main, status=paid)
total_reserved_seller = Σ withdrawal_requests(main, status in requested/approved/processing)
total_out_seller      = total_paid_seller + total_reserved_seller

# drenagem cascata idêntica para PAID e RESERVED, na ordem main → partner → pro
leftover = total_out_seller
main_final    = raw_main    - min(raw_main, leftover);    leftover -= consumido
partner_final = raw_partner - min(raw_partner, leftover); leftover -= consumido
pro_final     = raw_pro     - min(raw_pro, leftover)

# invariante forçada
total_earned  = raw_main_all + raw_partner_all + raw_pro_all   (inclui pending)
pending_main  = total_earned - (main_final + partner_final + pro_final) - total_paid_seller - total_reserved_seller
              = tudo que ainda não está liberado nem sacado
```

Efeito:
- Saque pago **abate também** partner/pro (fim do "R$ 9,06 fantasma" para todo mundo).
- `wallets.available_balance + partner_wallets.available_balance + professional_wallets.available_balance + total_withdrawn + pending_balance = total_earned` (invariante garantida por construção — não pode haver resíduo).
- Reservas ativas e pagos seguem a mesma cascata, então o UI já mostra imediatamente o desconto ao aprovar o saque.

### 2. Sanitizar valores stale + backfill global

- Rodar `recalc_wallets_for_owner(profile_id)` para **todos** os perfis com registro em `wallets`, `partner_wallets` ou `professional_wallets` (migração `DO $$ ... LOOP ... $$`).
- Zerar quaisquer `pending_balance / available_balance` que sobrem depois do recalc (não deve existir, mas fica como salvaguarda).

### 3. Fechar as portas para regressão

- Trigger `wallets_enforce_invariant_trg` (AFTER UPDATE em `wallets`): se `pending + available + withdrawn ≠ total_earned` (tolerância R$ 0,01), grava linha em `admin_audit_log` (`event = 'wallet_invariant_violation'`) — não bloqueia a operação para não travar o app, mas fica auditável.
- Todos os triggers hoje existentes que mexem em `wallets`, `partner_wallets`, `professional_wallets` passam a chamar exclusivamente `recalc_wallets_for_owner(profile_id)` (nunca mais UPDATE parcial), garantindo que qualquer alteração em `commissions`, `partner_product_orders` ou `withdrawal_requests` reprojeta as três carteiras juntas.

### 4. Front-end

Nenhuma mudança lógica: `getWalletSplit` já lê `wallets`, `partner_wallets`, `professional_wallets` diretamente (correção anterior). Depois do recalc, o app da Ana e o admin passam a mostrar exatamente o mesmo número, sem centavos órfãos.

## Verificação após aplicar

1. Ana Flávia: `pending_balance + available_balance (3 carteiras) + total_withdrawn = total_earned` — sem resíduo.
2. Simulação: aprovar o próximo saque dela e conferir que `partner_wallets.available_balance` e `professional_wallets.available_balance` caem para 0 se o valor sacado consumir a cascata.
3. Amostragem: rodar query de invariante em todos os `wallets` e confirmar 0 violações.

## Fora de escopo

- Nada muda em regras de comissão, patente, missão de rede ou fluxo de aprovação de saque.
- A tag "encaminhamento pendente" segue como está (é filtro de UI, tratado em outro ticket).
