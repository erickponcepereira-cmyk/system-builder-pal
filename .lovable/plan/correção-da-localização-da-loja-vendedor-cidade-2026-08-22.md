# Correção da localização da loja (vendedor → cidade)

## O que será feito

Aplicar a correção de `docs/propostas/2026-08-22-localizacao-correcao.sql` no banco de produção. Essa SQL corrige um problema na primeira versão da localização: a função `produtos_por_local()` devolvia uma linha por produto, e o PostgREST trunca respostas de função em 1000 linhas. Com 1814 produtos ativos, isso faria a loja perder silenciosamente cerca de 45% do catálogo ao filtrar por cidade.

A correção troca o modelo: em vez de devolver produto → cidade, devolve vendedor → cidade (~45 linhas) e a loja cruza isso no cliente com o catálogo que já carrega. Também refaz `cidades_com_loja()` para contar só vendedores que têm produto ativo à venda, evitando cidades que abririam vazias.

## Mudanças no banco

- `DROP FUNCTION public.produtos_por_local();` — a função antiga sai de circulação.
- `CREATE OR REPLACE FUNCTION public.vendedores_por_local()` — nova RPC security-definer que devolve apenas: tipo, id do vendedor, cidade normalizada, cidade de exibição e UF. Sem dados pessoais.
- `CREATE OR REPLACE FUNCTION public.cidades_com_loja()` — recriada, agora contando só vendedores com produto ativo.
- `GRANT EXECUTE` para `anon` e `authenticated` nas duas funções acima.

## Pré-condições (verificar antes)

- A função `produtos_por_local()` ainda existe (se já foi removida, o `DROP` é idempotente e não falha).
- A view `vendedor_local` e a função `normaliza_cidade()` existem, pois a correção depende delas.
- A tabela `partner_products` tem as colunas `status`, `is_active_by_partner` e `deleted_at`.
- A tabela `professional_products` tem as colunas `status`, `is_active_by_professional` e `coach_id`.

## Passos

1. **Verificar pré-condições**
   - Confirmar que `vendedor_local`, `normaliza_cidade` e `produtos_por_local` existem.
   - Confirmar que `vendedores_por_local` ainda não existe (se existir, será substituída).

2. **Aplicar a migration**
   - Usar o Lovable para rodar o conteúdo exato de `docs/propostas/2026-08-22-localizacao-correcao.sql`.

3. **Validar a criação**
   - Verificar que `vendedores_por_local()` existe e tem grant para `anon` e `authenticated`.
   - Verificar que `produtos_por_local()` não existe mais.
   - Rodar `SELECT * FROM public.vendedores_por_local();` e `SELECT * FROM public.cidades_com_loja();` para garantir que não retornam erro.
   - Verificar que `vendedores_por_local()` devolve bem menos de 1000 linhas (esperado ~45).

4. **Conferência opcional de diagnóstico**
   - Se o usuário quiser, rodar as queries de conferência do final do SQL para validar o vendedor de Porto Velho e produtos ativos.

## Não será alterado

- Nenhum arquivo de código fonte.
- Nenhuma tabela existente.
- Nenhum grant de coluna de `profiles`, `partners`, `coaches` ou `auth.users`.
- Nenhum comportamento da loja já funcional (o uso do novo `vendedores_por_local()` no frontend será feito depois, se necessário; o código existente em `src/lib/store-location.ts` já usa essa função, então deve passar a usar a versão corrigida automaticamente).

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| Função nova devolver mais de 1000 linhas | A fonte é `vendedor_local` (parceiros + profissionais aprovados), que são ~45 linhas; o PostgREST não corta. |
| View `vendedor_local` expor dados sem querer | A view continua revogada de `anon` e `authenticated`; só as RPCs security-definer leem dela. |
| Loja parar de carregar | As funções são aditivas ou substituem uma função antiga que ainda não é chamada pelo código de produção. |
| Migration falhar por função inexistente | `DROP IF EXISTS` e `CREATE OR REPLACE` são idempotentes. |
