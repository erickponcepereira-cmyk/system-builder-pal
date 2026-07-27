## O que está errado (verificado no banco)

**1. Disponível não desconta o que já foi sacado**

Consultei as carteiras: em **todas** elas `available_balance` está exatamente igual a `total_earned`, ignorando saques pagos e valores bloqueados:

| Pessoa | Disponível | Bloqueado | Ganho | Sacado |
|---|---|---|---|---|
| Nathan Utuari | 643,01 | 72,01 | 643,01 | 602,51 |
| Ana Flávia Lucas | 186,59 | 67,68 | 186,59 | 155,56 |
| Jorge Ramos | 135,54 | 63,57 | 135,54 | 59,00 |

A função oficial de recálculo (`recalc_wallets_for_owner`) faz a conta certa (desconta saques pagos, reservas e comissões de rede ainda travadas). O problema é outra função antiga, **`release_due_commissions_cron`**, que roda periodicamente e sobrescreve a carteira de todo mundo com um `UPDATE` bruto:

```
available_balance = soma das comissões "available"
pending_balance   = soma das comissões "pending"
total_earned      = ...
```

Ou seja: ela zera o efeito de qualquer saque e ignora bloqueio de rede/carência. Por isso o Nathan sacou R$ 602,51 e o disponível voltou ao valor cheio.

**2. Coluna "Bloqueado" sempre R$ 0,00 na lista**

Em `src/lib/admin-payouts.functions.ts` (listagem de pagamentos), a consulta da tabela `wallets` seleciona apenas `profile_id, available_balance, total_withdrawn` — sem `pending_balance` nem `total_earned`. A linha que calcula `blocked` lê um campo que nunca veio, resultando em 0. Ao abrir o detalhe da pessoa, outra consulta busca os dados de novo, e aí o valor aparece.

## Correções

**A. Parar a sobrescrita das carteiras (migração)**

Reescrever `release_due_commissions_cron` para apenas liberar comissões vencidas (`pending → available`) e, em seguida, chamar `recalc_wallets_for_owner` para cada beneficiário afetado — sem nenhum `UPDATE` direto em `wallets`. Assim existe uma única fonte de verdade para os saldos.

**B. Reconciliar todas as carteiras agora**

Rodar, na mesma migração, o recálculo para todos os perfis (mesma varredura usada em `admin_reconcile_all_wallets`), corrigindo Nathan, Ana Flávia, Jorge e os demais: o disponível passa a ser `liberado − sacado − reservado`, e o sacado permanece registrado.

**C. Corrigir a coluna "Bloqueado" na lista**

Em `src/lib/admin-payouts.functions.ts`, incluir `pending_balance` e `total_earned` no `select` da tabela `wallets`, para que Bloqueado e Total ganho apareçam já na listagem, iguais ao que o detalhe mostra.

## Verificação

Depois da migração, conferir por consulta que não sobra nenhuma carteira com `available_balance > total_earned − pending_balance − total_withdrawn` (hoje há 6), e revisar a tela de Pagamentos: Nathan deve mostrar disponível reduzido, sacado R$ 602,51 e bloqueado R$ 72,01.
