## Diagnóstico

O admin.students falha com `permission denied for table profiles` porque a tabela `public.profiles` **perdeu todos os GRANTs** para os roles do PostgREST (`authenticated`, `anon`, `service_role`). Confirmei via query no catálogo: só sobrou privilégio para `sandbox_exec`.

### Por que começou agora, se você não mexeu em admin/students

Na correção da recursão infinita de RLS em `profiles` (turno anterior, quando você reportou o erro "infinite recursion detected in policy for relation 'profiles'"), a migração recriou políticas e mexeu em funções `SECURITY DEFINER`. Nesse processo os GRANTs da tabela foram derrubados (`REVOKE`/`DROP`+`CREATE` ou reset de privilégios) e não foram restaurados no mesmo migration — que é justamente a regra crítica do Supabase: RLS sozinho não basta, precisa de GRANT explícito, senão o Data API responde `permission denied`.

Como quase todo lugar do sistema lê `profiles` via join embed do PostgREST, qualquer tela que só fizesse o join "sobrevivia" enquanto o cache/embed usava caminhos alternativos, mas o admin.students (após o fallback flat que adicionei) passa a buscar `profiles` diretamente → estoura o erro na cara.

## Correção

Migração única restaurando os GRANTs padrão em `profiles` conforme as políticas RLS existentes:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
-- anon: manter SELECT apenas se houver política pública (verificar antes de conceder)
```

Passos:
1. Rodar `\dp public.profiles` + listar policies para confirmar quais roles precisam de acesso (esperado: `authenticated` full, `service_role` all; `anon` somente se houver policy `USING (true)` — hoje as policies são baseadas em `auth.uid()`, então **não** dou GRANT a `anon`).
2. Emitir migração com os GRANTs acima.
3. Rodar auditoria rápida em todas as tabelas do `public` para detectar outras que tenham perdido GRANTs no mesmo incidente (mesmo padrão do troubleshooting oficial) e restaurar as que estiverem sem privilégio para `authenticated`/`service_role`, sem tocar em `anon` para evitar ampliar exposição.
4. Recarregar admin/students para confirmar que a listagem volta.

## Prevenção

- Toda migração que faça `DROP TABLE`/`REVOKE ALL` em `profiles` (ou qualquer tabela `public`) deve reincluir o bloco de GRANTs no mesmo arquivo.
- Adiciono um comentário no topo do migration de RLS de `profiles` reforçando a regra, e verifico que futuras alterações em policies não venham acompanhadas de `REVOKE`.

Aprovo?