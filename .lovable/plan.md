## Plano

1. **Corrigir a causa do erro**
   - Ajustar as funções de permissão que hoje consultam `profiles` por dentro de políticas da própria tabela `profiles`.
   - Isso remove o ciclo que gera: `infinite recursion detected in policy for relation "profiles"`.

2. **Evitar que o erro volte em outros cadastros**
   - Alterar as funções auxiliares `is_admin`, `current_coach_id`, `current_student_id` e a verificação de grupos para usarem leituras seguras que não disparem novamente as políticas de `profiles`.
   - Manter as mesmas permissões atuais: usuário vê o próprio perfil, admins administram, coaches/alunos/parceiros continuam respeitando as regras existentes.

3. **Validar o fluxo afetado**
   - Verificar novamente as políticas de `profiles` após a migração.
   - Testar consultas essenciais do seletor de portal para garantir que o painel não fique vazio por falha de permissão.

## Detalhes técnicos

- A correção será feita por migração no backend, usando `SECURITY DEFINER` com `SET row_security = off` nas funções que são chamadas pelas políticas de `profiles`.
- Não vou criar tabelas novas nem mexer no layout do app.
- O foco é impedir a recursão infinita em qualquer cadastro/login que precise ler `profiles`.