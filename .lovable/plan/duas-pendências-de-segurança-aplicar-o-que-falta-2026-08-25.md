# Duas pendências de segurança — aplicar o que falta

Antes de planejar, conferi o estado real do banco:

- **TRUNCATE nas tabelas existentes: já está revogado.** A consulta de privilégios em `public` para `anon` e `authenticated` volta vazia hoje. Essa parte já foi feita em alguma rodada anterior.
- **Os privilégios padrão ainda concedem TRUNCATE.** As regras de default privileges do schema `public` ainda incluem TRUNCATE para `anon` e `authenticated`, ou seja, a próxima tabela criada nasce com o problema de volta.
- **A função em lote `parceiros_publicos` não existe.** Só existe a versão de um id (`parceiro_publico`). Por isso a tela de gratuitos continua fazendo uma chamada por parceiro (o código já tenta a versão em lote e cai no fallback).

## O que será feito

1. Rodar de novo a revogação de TRUNCATE (inofensiva, já está limpa) e, principalmente, remover TRUNCATE dos privilégios padrão, para que tabelas novas não voltem a nascer com ele.
2. Criar a função `parceiros_publicos(uuid[])` exatamente como no texto: mesmos campos, mesma regra de "só parceiro aprovado", security definer com search_path fixo, execute apenas para usuários logados.
3. Não conceder as três colunas de `partners` a `authenticated` — recomendação mantida, nada a fazer.

Nenhuma mudança de código de tela é necessária: `src/lib/partner-public.ts` já chama `parceiros_publicos` primeiro e só usa o caminho lento quando ela não existe. Assim que a função existir, a aba de gratuitos passa a fazer uma chamada só.

## Detalhes técnicos

Migration única:

```sql
revoke truncate on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke truncate on tables from anon;
alter default privileges in schema public revoke truncate on tables from authenticated;

create or replace function public.parceiros_publicos(_ids uuid[]) ... -- conforme enviado
revoke execute on function public.parceiros_publicos(uuid[]) from public, anon;
grant execute on function public.parceiros_publicos(uuid[]) to authenticated;
```

Observação: existem duas regras de default privileges (uma do `postgres`, outra do `supabase_admin`). A migration roda como `postgres`, então remove a dela; a do `supabase_admin` é gerida pela plataforma e pode permanecer. Verifico o resultado depois de aplicar e reporto o que ficou.

## Verificação após aplicar

- Consulta de TRUNCATE em `public` para `anon`/`authenticated` deve voltar vazia.
- Chamada de `parceiros_publicos` com alguns ids retorna apenas parceiros aprovados.
- Aba de benefícios/gratuitos continua listando normalmente, agora com uma única ida ao servidor.
