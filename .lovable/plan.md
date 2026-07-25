Vou finalizar a correção do erro de exclusão de cadastro, focando no bloqueio mostrado: `wallets_profile_id_fkey`.

Plano:

1. **Corrigir a limpeza antes de excluir usuário**
   - Atualizar a função de limpeza administrativa para remover/zerar dependências que ainda prendem o perfil antes do cadastro ser apagado.
   - Incluir explicitamente as carteiras vinculadas ao perfil, principalmente `wallets`, e também revisar carteiras relacionadas por aluno/coach/parceiro/profissional para não sobrar vínculo órfão.

2. **Reforçar o fallback de exclusão**
   - Ajustar o fallback `admin_hard_delete_user` para executar a limpeza na ordem correta.
   - Garantir que a exclusão só continue se o usuário for admin e não estiver tentando excluir o próprio cadastro.

3. **Verificar outros bloqueios do mesmo tipo**
   - Conferir todas as chaves estrangeiras restritivas contra `profiles`, `students`, `coaches` e `auth.users`.
   - Incluir no purge os vínculos `NO ACTION` que ainda possam bloquear exclusão, sem abrir permissões públicas.

4. **Validar com o caso real da tela**
   - Executar uma tentativa controlada para o cadastro exibido no print (`sindscond@gmail.com`) ou simular a cadeia com os mesmos vínculos.
   - Confirmar separadamente: limpeza de dependências, remoção da carteira vinculada e exclusão do cadastro.

5. **Manter o código do admin usando a rota correta**
   - Revisar `adminDeleteUser` para garantir que ele chama a limpeza, tenta a exclusão normal e usa o hard-delete apenas como fallback.

Resultado esperado:
- O botão **Excluir** não deve mais falhar por `wallets_profile_id_fkey`.
- Se outro vínculo bloquear, ele será identificado e incluído na mesma correção.
- A exclusão administrativa ficará consistente para alunos/coaches/parceiros/profissionais com carteiras e histórico financeiro vinculados.