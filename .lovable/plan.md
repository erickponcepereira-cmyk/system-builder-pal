# Banners e popup da loja — FitMind Club

## Objetivo
Aplicar a migração de banco de dados para criar a tabela `store_banners`, que permite ao admin configurar a faixa do topo e popups da loja, sem perder o comportamento atual de fallback (destacar produtos do catálogo quando não houver banner ativo).

## Estado atual
- O código de frontend (`src/lib/store-banners.ts`, `src/components/store/StoreBanner.tsx`, `src/routes/_authenticated/admin.banners.tsx`) e a página de admin já estão criados.
- A tabela `public.store_banners` ainda não existe no banco de dados (verificado: `exists = false`).
- O script enviado precisa dos `GRANT`s obrigatórios e de um trigger para `updated_at` para estar de acordo com os padrões do projeto.

## O que será feito

### 1. Migração de banco
Criar a tabela `public.store_banners` com os campos do script enviado, seguindo a ordem exigida:
1. `CREATE TABLE`
2. `GRANT` para `anon`, `authenticated` e `service_role`
3. `CREATE INDEX`
4. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`
5. `CREATE POLICY` de leitura pública e escrita administrativa
6. Trigger para atualizar `updated_at` automaticamente
7. Insert de banners de exemplo

### 2. Ajustes de segurança
- Adicionar `GRANT SELECT` para `anon` (a política de leitura pública permite visitantes não logados).
- Adicionar `GRANT SELECT, INSERT, UPDATE, DELETE` para `authenticated` e `ALL` para `service_role`.
- Criar função/trigger `update_store_banners_updated_at` para manter `updated_at` atualizado.

### 3. Verificação
- Confirmar que a tabela existe no banco.
- Confirmar que as policies e grants foram aplicados.
- Validar que o admin `/admin/banners` consegue ler, criar, editar e excluir banners.
- Validar que a loja (`/student/loja-teste` ou equivalente) exibe a faixa do topo e popups corretamente.

## SQL a ser aplicado (resumido)
```sql
CREATE TABLE public.store_banners (...);
GRANT SELECT ON public.store_banners TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_banners TO authenticated;
GRANT ALL ON public.store_banners TO service_role;
CREATE INDEX idx_store_banners_ativo ON public.store_banners (kind, is_active, sort_order);
ALTER TABLE public.store_banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY store_banners_public_read ...;
CREATE POLICY store_banners_admin_write ...;
CREATE OR REPLACE FUNCTION public.update_store_banners_updated_at() ...;
CREATE TRIGGER update_store_banners_updated_at BEFORE UPDATE ...;
INSERT INTO public.store_banners (...) VALUES (...);
```

## Observação
O frontend já está pronto. Após a migração, a funcionalidade estará operacional tanto no painel administrativo quanto na loja.
