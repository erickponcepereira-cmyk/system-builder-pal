## Diagnóstico (confirmado nos dados)

Caso Ana Flávia Lucas (`profile 7deffbca…`), saque aprovado de R$ 60,00:

- `wallets`: `total_earned 254,27` · `total_withdrawn 155,56` · `pending 38,31` · **`available 0,40`**
- `professional_wallets`: `available 2,48`
- Saques já pagos: 50,56 + 105,00 = 155,56 ✔

A função `recalc_wallets_for_owner` **já desconta do saldo disponível os saques em aberto** (status `requested/approved/processing` — bloco "reserved"). Ou seja: os R$ 60 aprovados saíram de `available` e viraram reserva (60,40 → 0,40).

Só que `admin_mark_withdrawal_paid` valida assim:

```sql
v_available = wallets.available + partner_wallets.available + professional_wallets.available
IF v_available < w.amount THEN RAISE 'Saldo disponível insuficiente (R$ %)'
```

Como o próprio saque já foi reservado (subtraído), o valor nunca "cabe" na conferência → **contagem dupla**. Todo saque aprovado com valor maior que o troco restante trava na hora de marcar como pago. Não há dinheiro faltando: o valor existe, apenas está reservado para esse mesmo pedido.

Problemas secundários encontrados no mesmo caminho:

1. A soma de verificação **ignora `student_wallets`** (Ana tem 40,00 lá), então saques de aluno-indicador pagos pela tela geral podem falhar por engano.
2. Existe uma função legada `update_coach_withdrawal_status` que, ao marcar como pago, **debita a carteira na mão e soma em `total_withdrawn`** — o que conflita com o `recalc_wallets_for_owner` (que recalcula tudo a partir das comissões) e pode gerar saldo negativo/divergente se ainda for chamada em algum ponto.
3. `admin_mark_student_withdrawal_paid` tem a mesma conferência isolada e também debita manualmente.

## Correção

**Migração de banco (única):**

1. Reescrever `admin_mark_withdrawal_paid`:
   - Calcular o disponível somando `wallets` + `partner_wallets` + `professional_wallets` + `student_wallets` do perfil.
   - **Somar de volta a reserva deste próprio pedido** (o valor do saque que está sendo pago) antes de comparar — isto é, comparar contra "disponível + reservado deste pedido".
   - Manter a tolerância de arredondamento e a mensagem de erro, mas incluir no texto o disponível e o reservado, para o admin entender o que faltou quando realmente faltar.
   - Continuar chamando `recalc_wallets_for_owner` no final (é ele que move o valor de "reservado" para "sacado" ao virar `paid`).
2. Ajustar `admin_mark_student_withdrawal_paid` com a mesma lógica de reserva (não exigir que o valor ainda esteja em `available` se ele já foi reservado).
3. Neutralizar a função legada `update_coach_withdrawal_status`: em vez de debitar carteira manualmente, delegar para `admin_mark_withdrawal_paid` / atualizar status e chamar `recalc_wallets_for_owner`, evitando dedução dupla.

**Verificação após a migração:**

- Marcar o saque de R$ 60,00 da Ana Flávia como pago e conferir: `withdrawal_requests.status = paid`, `wallets.total_withdrawn` passa a 215,56 e `available` volta a refletir só o que sobrou.
- Rodar uma consulta de auditoria em todos os perfis com saque em aberto para confirmar que nenhum ficou com `available` negativo ou com reserva órfã.

Sem mudanças de frontend — a tela de Pagamentos já usa essas funções.
