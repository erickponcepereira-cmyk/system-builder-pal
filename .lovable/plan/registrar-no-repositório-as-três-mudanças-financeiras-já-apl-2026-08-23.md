# Registrar no repositório as três mudanças financeiras já aplicadas no banco

## Contexto

Três funções foram alteradas/criadas direto em produção e não constam em nenhuma migration do repositório:

1. `public.saldo_disponivel(uuid)` — função nova (definição única de saldo sacável)
2. `public.admin_mark_withdrawal_paid(uuid, uuid, text)` — trava de saldo passou a usar `saldo_disponivel`
3. `public.pay_coach_available(uuid, text, text)` — deixou de subtrair o saldo direto e chama `recalc_wallets_for_owner` no fim

Confirmado no banco: as três existem hoje com esses corpos (lidos via `pg_get_functiondef`).

## O que será feito

1. Capturar o `pg_get_functiondef` atual das três funções no banco de produção.
2. Criar UMA migration nova contendo, literalmente e sem qualquer edição, os três `CREATE OR REPLACE FUNCTION` retornados pelo banco, mais as duas linhas finais:
   - `REVOKE ALL ON FUNCTION public.saldo_disponivel(uuid) FROM PUBLIC;`
   - `GRANT EXECUTE ON FUNCTION public.saldo_disponivel(uuid) TO authenticated, service_role;`

## O que NÃO será feito

- Nenhuma alteração, reescrita ou "melhoria" no corpo das funções.
- Nenhuma mudança em outras funções, tabelas, políticas, migrations existentes ou telas.
- Nenhum `UPDATE`, `INSERT` ou `DELETE` em dados; nada retroativo.

## Validação

Depois de aplicar, rodar novamente `pg_get_functiondef` das três funções e devolver o resultado, para conferir que continuam idênticos ao estado anterior à migration.
