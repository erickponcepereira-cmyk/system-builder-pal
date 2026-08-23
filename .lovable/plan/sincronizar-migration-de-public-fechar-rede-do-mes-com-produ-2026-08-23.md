# Sincronizar migration de `public.fechar_rede_do_mes` com produção

## Contexto

A migration `20260823193309_beb5207b-6b37-4c9a-9f91-bca11bf9849d.sql` no repositório contém uma versão antiga da função `public.fechar_rede_do_mes` com dois bugs já corrigidos diretamente no banco de produção:

1. Faltam casts `::text` em nomes vindos de `profiles` (varchar), causando `structure of query does not match function result type`.
2. A coluna `para` da tabela temporária `_plano` colide com o parâmetro de saída `para`, causando `column reference para is ambiguous`.

Se a migration antiga for reaplicada, ela sobrescreve a versão correta e quebra o fechamento mensal da rede.

## O que será feito

1. Consultar o banco de produção via `pg_get_functiondef('public.fechar_rede_do_mes'::regprocedure)` para capturar o corpo exato da função como está agora.
2. Criar uma nova migration com timestamp sequencial contendo **apenas**:
   - `CREATE OR REPLACE FUNCTION public.fechar_rede_do_mes(...)` com o corpo literal retornado pelo banco;
   - `REVOKE ALL ON FUNCTION ... FROM PUBLIC;`
   - `GRANT EXECUTE ON FUNCTION ... TO authenticated, service_role;`
3. Não alterar, excluir ou editar a migration `20260823193309_*` existente.
4. Não executar nenhum `UPDATE`, `INSERT`, `DELETE` ou outra mudança retroativa em dados.
5. Não modificar tabelas, políticas, telas ou outras funções.

## Validação

Após aplicar a nova migration, retornar o resultado de `pg_get_functiondef('public.fechar_rede_do_mes'::regprocedure)` para conferência, garantindo que permanece idêntico ao valor capturado antes da mudança.
