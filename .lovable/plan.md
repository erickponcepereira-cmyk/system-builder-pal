# Aplicar localização real da loja (vendedor → cidade/UF)

## O que será feito

Aplicar o SQL de `docs/propostas/2026-08-22-localizacao.sql` no banco de produção, sem alterar código. Esse SQL cria três RPCs e uma view interna que permitem filtrar produtos de parceiros e profissionais pela cidade do vendedor, usando apenas cidade/UF normalizadas — nunca endereço, CEP ou coordenadas.

## Por que isso é seguro

- O SQL é **idempotente**: usa `CREATE OR REPLACE` para funções e view.
- Não cria novas tabelas, então não precisa de GRANT de tabela.
- Não mexe em grants de colunas existentes (isso quebrou o login do parceiro na última vez). A view `vendedor_local` é criada e **imediatamente revogada** de `anon` e `authenticated`; o único acesso permitido é via RPCs `security definer`.
- As RPCs expõem só: cidade normalizada, cidade de exibição, UF e contagem de vendedores. Nenhum dado pessoal.

## Passos

1. **Verificar pré-condições** (read-only)
   - Confirmar que `normaliza_cidade`, `cidades_com_loja`, `produtos_por_local` e a view `vendedor_local` ainda não existem.
   - Confirmar que `partners.city/state` e `profiles.city/state` estão populados.

2. **Aplicar a migration** pelo Lovable, usando exatamente o conteúdo do arquivo `docs/propostas/2026-08-22-localizacao.sql`.

3. **Validar a criação**
   - Verificar que as quatro funções/view existem no catálogo.
   - Verificar que os grants de EXECUTE estão corretos (`anon` e `authenticated`).
   - Rodar `SELECT * FROM public.cidades_com_loja();` e `SELECT * FROM public.produtos_por_local();` para garantir que não retornam erro.

4. **Testar impacto na loja**
   - Abrir a página pública `/loja` no preview e confirmar que continua carregando normalmente (a loja pública ainda usa `unified-store.ts`, não as novas RPCs, então não deve ser afetada).
   - Verificar que a loja logada (`/_authenticated/loja` ou similar) continua funcional.

5. **Diagnóstico opcional**
   - Se o usuário quiser, rodar as queries de diagnóstico do final do SQL para listar vendedores sem cidade e produtos que ficarão invisíveis ao filtrar por cidade.

## Não será alterado

- Nenhum arquivo de código fonte.
- Nenhuma tabela existente.
- Nenhum grant de coluna de `profiles`, `partners`, `coaches` ou `auth.users`.
- Nenhum comportamento da loja já funcional (o filtro por cidade será integrado depois, se necessário).

## Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| View `vendedor_local` expor dados sem querer | `REVOKE ALL ... FROM anon, authenticated` está no próprio SQL. |
| Funções com `search_path` mutável | O SQL já fixa `search_path = public, pg_temp`. |
| Loja parar de carregar | As novas RPCs não são chamadas por código existente; testaremos o preview. |
| Migration falhar por conflito com funções existentes | Verificamos no passo 1 se elas existem. Se já existirem, a migration é apenas um replace. |
