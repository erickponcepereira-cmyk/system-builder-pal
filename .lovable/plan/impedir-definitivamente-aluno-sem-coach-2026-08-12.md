# Impedir definitivamente aluno sem coach

## Diagnóstico confirmado

- Hoje existem **6 alunos com coach não confirmado**. Todos foram criados com o mesmo coach automático e `coach_assignment_pending = true`; os dois mais recentes surgiram em 12/08/2026.
- A origem é o gatilho `on_profile_created_ensure_student`: assim que nasce um perfil com papel de aluno, ele cria uma linha em `students` com coach automático **antes** da pessoa escolher ou validar o coach.
- O cadastro normal e a conclusão por Google/Apple já exigem um `coachId`, porém o gatilho antecipado permite que a conta incompleta exista e apareça no admin.
- Existem ainda outros escritores antigos que criam/ajustam aluno diretamente. A regra não está centralizada, portanto um fluxo novo pode esquecer de confirmar o coach ou de atualizar a marcação de pendência.
- `students.coach_id` já é obrigatório no banco, mas isso não resolve o problema porque o coach automático satisfaz a coluna sem representar uma indicação confirmada.

## Correção

1. **Parar de criar aluno automaticamente ao nascer o perfil**
   - Remover o gatilho que cria `students` com coach automático.
   - O perfil de autenticação poderá existir enquanto o cadastro está incompleto, mas o registro de aluno só nascerá após um coach válido ser escolhido ou validado pela indicação.

2. **Tornar coach confirmado uma condição obrigatória**
   - Consolidar a criação de aluno em uma rotina única no banco.
   - Rejeitar criação sem coach, coach inexistente, bloqueado ou o próprio usuário.
   - Nunca usar coach padrão como substituição silenciosa em novos cadastros.
   - Fazer os fluxos de aluno, coach, profissional, parceiro e conclusão Google/Apple passarem por essa mesma regra.

3. **Fechar escritores paralelos**
   - Ajustar gatilhos de aprovação, criação do painel de aluno e reserva de benefícios para reutilizarem a rotina central, em vez de inserir diretamente em `students`.
   - Garantir que mudanças administrativas de coach também deixem o vínculo confirmado e consistente.

4. **Bloquear acesso até concluir corretamente**
   - Quando uma conta autenticada ainda não possuir aluno com coach confirmado, exibir somente a conclusão obrigatória do cadastro.
   - Nenhum painel, loja, desafio ou benefício ficará acessível antes da confirmação.
   - Links de indicação preservados serão revalidados no servidor; sem indicação válida, a pessoa deverá escolher um coach ativo.

5. **Tratar os 6 casos existentes sem inventar vínculos**
   - Manter essas contas bloqueadas até que o coach real seja confirmado.
   - Reaproveitar indicação válida ainda recuperável quando houver evidência; caso contrário, exigir seleção no próximo acesso.
   - Após confirmação, remover cada pessoa da lista de pendentes. Não atribuir coach em massa por suposição.

## Validação

- Cadastro por e-mail sem coach: não cria aluno e não libera acesso.
- Google/Apple sem indicação: exige escolha de coach antes de criar/liberar o aluno.
- Link de indicação válido: grava exatamente o coach resolvido pelo servidor e já nasce confirmado.
- Cadastro de coach, profissional ou parceiro: mantém o coach responsável e cria o painel de aluno com o mesmo vínculo.
- Tentativas de enviar coach inexistente, bloqueado, próprio ou omitir o campo são rejeitadas no servidor e no banco.
- Consultar o banco após os testes e confirmar: nenhum aluno novo pendente, nenhum `coach_id` ausente e nenhum uso silencioso do coach automático.
- Rodar a verificação de segurança do banco após a migração.
